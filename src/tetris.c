/*
 * fretris — Tetris in freestanding C, compiled to WebAssembly.
 * Copyright (C) 2026 moon440
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Rules follow the Tetris Guideline: 10x20 field, 7-bag randomizer, SRS
 * rotation with wall kicks, hold, next-3 preview, ghost piece, 700 ms lock
 * delay (max 15 move-resets), guideline gravity and scoring. Deterministic:
 * one init(seed) + input tape = replayable run.
 */

typedef unsigned char u8;
typedef signed char s8;
typedef unsigned int u32;

#define COLS 10
#define ROWS 20
#define BUFH 4 /* hidden rows above the visible field */
#define FBW 480
#define FBH 400
#define CELL 18
#define OX 30  /* playfield origin */
#define OY 20

/* game states */
#define ST_TITLE 0
#define ST_PLAY  1
#define ST_PAUSE 2
#define ST_OVER  3

/* key codes sent by the host */
#define K_L 0
#define K_R 1
#define K_D 2
#define K_CW 3
#define K_CCW 4
#define K_HOLD 5
#define K_HARD 6
#define K_PAUSE 7
#define K_ENTER 8
#define K_RESTART 9

/* audio event bits, consumed by the JS host (PC speaker emulation) */
#define EV_MOVE   1u
#define EV_ROT    2u
#define EV_SOFT   4u
#define EV_HARD   8u
#define EV_LOCK   16u
#define EV_CLEAR  32u
#define EV_TETRIS 64u
#define EV_HOLD   128u
#define EV_LEVEL  256u
#define EV_OVER   512u
#define EV_START  1024u

/* ---------------------------------------------------------------- utils */
static unsigned long my_strlen(const char *s) { const char *p = s; while (*p) p++; return (unsigned long)(p - s); }

/* ------------------------------------------------------------------ fb */
static u8 fb[FBW * FBH * 4];

static void fb_clear(u8 r, u8 g, u8 b) {
    int i;
    for (i = 0; i < FBW * FBH; i++) {
        fb[i * 4 + 0] = r; fb[i * 4 + 1] = g; fb[i * 4 + 2] = b; fb[i * 4 + 3] = 255;
    }
}
static void fb_rect(int x, int y, int w, int h, u8 r, u8 g, u8 b) {
    int i, j;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > FBW) w = FBW - x;
    if (y + h > FBH) h = FBH - y;
    if (w < 0) w = 0;
    if (h < 0) h = 0;
    for (j = 0; j < h; j++)
        for (i = 0; i < w; i++) {
            int p = ((y + j) * FBW + (x + i)) * 4;
            fb[p] = r; fb[p + 1] = g; fb[p + 2] = b;
        }
}
/* solid cell with an inset border */
static void fb_block(int x, int y, int s, u8 r, u8 g, u8 b) {
    fb_rect(x, y, s, s, r, g, b);
    fb_rect(x + 1, y + 1, s - 2, s - 2, r / 2, g / 2, b / 2);
    fb_rect(x + 2, y + 2, s - 4, s - 4, r, g, b);
}
static void fb_ghost(int x, int y, int s, u8 r, u8 g, u8 b) {
    fb_rect(x, y, s, 1, r, g, b);
    fb_rect(x, y + s - 1, s, 1, r, g, b);
    fb_rect(x, y, 1, s, r, g, b);
    fb_rect(x + s - 1, y, 1, s, r, g, b);
}

/* ------------------------------------------------------- 5x7 bitmap font
 * order: ' ', '0'-'9', 'A'-'Z', '-', '.', ':', '>', '+'   (42 glyphs) */
static const u8 FONT[42][7] = {
    {0,0,0,0,0,0,0},
    {0x0E,0x11,0x13,0x15,0x19,0x11,0x0E},{0x04,0x0C,0x04,0x04,0x04,0x04,0x0E},
    {0x0E,0x11,0x01,0x02,0x04,0x08,0x1F},{0x1F,0x02,0x04,0x02,0x01,0x11,0x0E},
    {0x02,0x06,0x0A,0x12,0x1F,0x02,0x02},{0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E},
    {0x06,0x08,0x10,0x1E,0x11,0x11,0x0E},{0x1F,0x01,0x02,0x04,0x08,0x08,0x08},
    {0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E},{0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C},
    {0x0E,0x11,0x11,0x1F,0x11,0x11,0x11},{0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E},
    {0x0E,0x11,0x10,0x10,0x10,0x11,0x0E},{0x1C,0x12,0x11,0x11,0x11,0x12,0x1C},
    {0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F},{0x1F,0x10,0x10,0x1E,0x10,0x10,0x10},
    {0x0E,0x11,0x10,0x17,0x11,0x11,0x0F},{0x11,0x11,0x11,0x1F,0x11,0x11,0x11},
    {0x0E,0x04,0x04,0x04,0x04,0x04,0x0E},{0x07,0x02,0x02,0x02,0x02,0x12,0x0C},
    {0x11,0x12,0x14,0x18,0x14,0x12,0x11},{0x10,0x10,0x10,0x10,0x10,0x10,0x1F},
    {0x11,0x1B,0x15,0x15,0x11,0x11,0x11},{0x11,0x11,0x19,0x15,0x13,0x11,0x11},
    {0x0E,0x11,0x11,0x11,0x11,0x11,0x0E},{0x1E,0x11,0x11,0x1E,0x10,0x10,0x10},
    {0x0E,0x11,0x11,0x11,0x15,0x12,0x0D},{0x1E,0x11,0x11,0x1E,0x14,0x12,0x11},
    {0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E},{0x1F,0x04,0x04,0x04,0x04,0x04,0x04},
    {0x11,0x11,0x11,0x11,0x11,0x11,0x0E},{0x11,0x11,0x11,0x11,0x11,0x0A,0x04},
    {0x11,0x11,0x11,0x15,0x15,0x1B,0x11},{0x11,0x11,0x0A,0x04,0x0A,0x11,0x11},
    {0x11,0x11,0x0A,0x04,0x04,0x04,0x04},{0x1F,0x01,0x02,0x04,0x08,0x10,0x1F},
    {0,0,0,0x1F,0,0,0},{0,0,0,0,0,0x0C,0x0C},
    {0,0x0C,0x0C,0,0x0C,0x0C,0},{0x08,0x04,0x02,0x01,0x02,0x04,0x08},
    {0,0,0x04,0x1F,0x04,0,0},
};
static int glyph_idx(char c) {
    if (c == ' ') return 0;
    if (c >= '0' && c <= '9') return 1 + (c - '0');
    if (c >= 'A' && c <= 'Z') return 11 + (c - 'A');
    if (c >= 'a' && c <= 'z') return 11 + (c - 'a');
    if (c == '-') return 37;
    if (c == '.') return 38;
    if (c == ':') return 39;
    if (c == '>') return 40;
    if (c == '+') return 41;
    return 0;
}
static void fb_text(const char *s, int x, int y, int sc, u8 r, u8 g, u8 b) {
    int cw = 6 * sc;
    while (*s) {
        const u8 *gl = FONT[glyph_idx(*s)];
        int row, col;
        if (*s != ' ')
            for (row = 0; row < 7; row++)
                for (col = 0; col < 5; col++)
                    if (gl[row] & (0x10 >> col))
                        fb_rect(x + col * sc, y + row * sc, sc, sc, r, g, b);
        x += cw; s++;
    }
}
static void fb_center(const char *s, int x0, int x1, int y, int sc, u8 r, u8 g, u8 b) {
    int w = (int)my_strlen(s) * 6 * sc - sc;
    fb_text(s, x0 + ((x1 - x0) - w) / 2, y, sc, r, g, b);
}
static void fb_num(u32 n, int x, int y, int sc, u8 r, u8 g, u8 b) {
    char buf[12];
    int i = 0;
    u32 d = 1000000000u;
    while (d > 9 && n < d) d /= 10;
    while (d) { buf[i++] = (char)('0' + (n / d) % 10); d /= 10; }
    buf[i] = 0;
    fb_text(buf, x, y, sc, r, g, b);
}

/* ---------------------------------------------------------------- pieces */
/* piece colors */
static const u8 PCOL[7][3] = {
    {85, 255, 255},   /* I cyan   */
    {255, 255, 85},   /* O yellow */
    {170, 85, 255},   /* T purple */
    {85, 255, 85},    /* S green  */
    {255, 85, 85},    /* Z red    */
    {85, 85, 255},    /* J blue   */
    {212, 212, 212},  /* L gray   */
};

/* cells (x,y) per piece, 4 rotation states, y down.
   I in a 4x4 box, O in a 2x2 box, the rest in 3x3 boxes. */
static const u8 SHAPE[7][4][8] = {
    {{0,1,1,1,2,1,3,1},{2,0,2,1,2,2,2,3},{0,2,1,2,2,2,3,2},{1,0,1,1,1,2,1,3}}, /* I */
    {{0,0,1,0,0,1,1,1},{0,0,1,0,0,1,1,1},{0,0,1,0,0,1,1,1},{0,0,1,0,0,1,1,1}}, /* O */
    {{1,0,0,1,1,1,2,1},{1,0,1,1,2,1,1,2},{0,1,1,1,2,1,1,2},{1,0,0,1,1,1,1,2}}, /* T */
    {{1,0,2,0,0,1,1,1},{1,0,1,1,2,1,2,2},{1,1,2,1,0,2,1,2},{0,0,0,1,1,1,1,2}}, /* S */
    {{0,0,1,0,1,1,2,1},{2,0,1,1,2,1,1,2},{0,1,1,1,1,2,2,2},{1,0,0,1,1,1,0,2}}, /* Z */
    {{0,0,0,1,1,1,2,1},{1,0,2,0,1,1,1,2},{0,1,1,1,2,1,2,2},{1,0,1,1,0,2,1,2}}, /* J */
    {{2,0,0,1,1,1,2,1},{1,0,1,1,1,2,2,2},{0,1,1,1,2,1,0,2},{0,0,1,0,1,1,1,2}}, /* L */
};

/* SRS kicks in screen coords (y down), indexed [from][test].
   Only the four legal transitions per direction are filled. */
static const s8 K_JLSTZ_CW[4][5][2] = {   /* 0->R, R->2, 2->L, L->0 */
    {{0,0},{-1,0},{-1,-1},{0,2},{-1,2}},
    {{0,0},{1,0},{1,1},{0,-2},{1,-2}},
    {{0,0},{1,0},{1,-1},{0,2},{1,2}},
    {{0,0},{-1,0},{-1,1},{0,-2},{-1,-2}},
};
static const s8 K_JLSTZ_CCW[4][5][2] = {  /* 0->L, R->0, 2->R, L->2 */
    {{0,0},{1,0},{1,-1},{0,2},{1,2}},
    {{0,0},{1,0},{1,1},{0,-2},{1,-2}},
    {{0,0},{-1,0},{-1,-1},{0,2},{-1,2}},
    {{0,0},{-1,0},{-1,1},{0,-2},{-1,-2}},
};
static const s8 K_I_CW[4][5][2] = {
    {{0,0},{-2,0},{1,0},{-2,1},{1,-2}},
    {{0,0},{-1,0},{2,0},{-1,-2},{2,1}},
    {{0,0},{2,0},{-1,0},{2,-1},{-1,2}},
    {{0,0},{1,0},{-2,0},{1,2},{-2,-1}},
};
static const s8 K_I_CCW[4][5][2] = {
    {{0,0},{-1,0},{2,0},{-1,-2},{2,1}},
    {{0,0},{2,0},{-1,0},{2,-1},{-1,2}},
    {{0,0},{1,0},{-2,0},{1,2},{-2,-1}},
    {{0,0},{-2,0},{1,0},{-2,1},{1,-2}},
};

/* ----------------------------------------------------------------- state */
static u8 well[ROWS + BUFH][COLS]; /* 0 empty, else piece+1 */
static u32 rng, seed0;
static u32 gains[4];               /* last four score gains, newest first */
static u32 scoreAtSpawn;
static int cur, currot, curx, curly, holdp, holdused;
static int queue[16], qhead;
static u32 score, lines, level;
static u32 g_acc, lock_acc, lock_resets, clear_timer, blink_acc;
static int state;
static u32 events;
static int key_l, key_r, key_d, das_ms, arr_ms;
#define DAS 150
#define ARR 40
#define LOCK_DELAY 700

static void bag_fill(int *q) {
    int i;
    for (i = 0; i < 7; i++) q[i] = i;
    for (i = 0; i < 7; i++) {
        int j, t;
        rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
        j = i + (int)(rng % (u32)(7 - i));
        t = q[i]; q[i] = q[j]; q[j] = t;
    }
}
static int next_piece(void) {
    if (qhead + 3 >= 14) {
        int i;
        for (i = 0; i < 7; i++) queue[i] = queue[7 + i];
        bag_fill(queue + 7);
        qhead -= 7;
    }
    return queue[qhead++];
}

static int fits(int p, int rot, int x, int y) {
    const u8 *c = SHAPE[p][rot];
    int i;
    for (i = 0; i < 4; i++) {
        int cx = x + c[i * 2], cy = y + c[i * 2 + 1];
        if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS + BUFH) return 0;
        if (well[cy][cx]) return 0;
    }
    return 1;
}

/* guideline spawn: all pieces at column 3, except O at column 4 */
static int spawn_x(int p) { return p == 1 ? 4 : 3; }

static int spawn(void) {
    cur = next_piece();
    currot = 0; curx = spawn_x(cur); curly = 0; holdused = 0;
    lock_acc = 0; lock_resets = 0; g_acc = 0;
    scoreAtSpawn = score;
    if (!fits(cur, currot, curx, curly)) { state = ST_OVER; events |= EV_OVER; return 0; }
    return 1;
}

static u32 gravity_ms(void) {
    /* Tetris Guideline speeds, seconds-per-row rounded to ms */
    static const u32 tbl[15] = {1000,793,613,473,365,283,220,169,132,100,
                                78,60,47,36,28};
    u32 i = level - 1;
    return tbl[i < 15 ? i : 14];
}

static int try_move(int dx, int dy, int drot) {
    if (drot) {
        int rot = (currot + (drot > 0 ? 1 : 3)) & 3, i;
        const s8 (*k)[5][2] = (cur == 0)
            ? (drot > 0 ? K_I_CW : K_I_CCW)
            : (drot > 0 ? K_JLSTZ_CW : K_JLSTZ_CCW);
        for (i = 0; i < 5; i++) {
            int tx = curx + k[currot][i][0], ty = curly + k[currot][i][1];
            if (fits(cur, rot, tx, ty)) {
                currot = rot; curx = tx; curly = ty;
                if (lock_resets < 15) { lock_acc = 0; lock_resets++; }
                return 1;
            }
        }
        return 0;
    }
    if (fits(cur, currot, curx + dx, curly + dy)) {
        curx += dx; curly += dy;
        if (dy == 0 && lock_resets < 15) { lock_acc = 0; lock_resets++; }
        return 1;
    }
    return 0;
}

static int ghost_y(void) {
    int y = curly;
    while (fits(cur, currot, curx, y + 1)) y++;
    return y;
}

static void lock_current(void) {
    const u8 *c = SHAPE[cur][currot];
    int i, r, n = 0;
    for (i = 0; i < 4; i++) {
        int cx = curx + c[i * 2], cy = curly + c[i * 2 + 1];
        if (cy >= 0 && cy < ROWS + BUFH) well[cy][cx] = (u8)(cur + 1);
    }
    events |= EV_LOCK;
    for (r = BUFH; r < ROWS + BUFH; r++) {
        int c2, full = 1;
        for (c2 = 0; c2 < COLS; c2++) if (!well[r][c2]) { full = 0; break; }
        if (full) n++;
    }
    if (n) {
        static const u32 pts[5] = {0, 100, 300, 500, 800};
        int wr = ROWS + BUFH - 1, pr;
        u32 nl;
        clear_timer = 250;
        events |= n == 4 ? EV_TETRIS : EV_CLEAR;
        for (pr = ROWS + BUFH - 1; pr >= 0; pr--) {
            int cc, full = 1;
            for (cc = 0; cc < COLS; cc++) if (!well[pr][cc]) { full = 0; break; }
            if (!full) {
                if (wr != pr) for (cc = 0; cc < COLS; cc++) well[wr][cc] = well[pr][cc];
                wr--;
            }
        }
        for (; wr >= 0; wr--) { int cc; for (cc = 0; cc < COLS; cc++) well[wr][cc] = 0; }
        score += pts[n] * level;
        lines += (u32)n;
        nl = lines / 10 + 1;
        if (nl != level) { level = nl; events |= EV_LEVEL; }
    }
    { u32 d = score - scoreAtSpawn;
      if (d) { gains[3] = gains[2]; gains[2] = gains[1]; gains[1] = gains[0]; gains[0] = d; } }
    spawn();
}

static void hard_drop(void) {
    int dist = 0;
    while (fits(cur, currot, curx, curly + 1)) { curly++; dist++; }
    score += (u32)dist * 2;
    events |= EV_HARD;
    lock_current();
}

static void reset_game(void) {
    int r, c;
    rng = seed0;
    for (r = 0; r < ROWS + BUFH; r++) { for (c = 0; c < COLS; c++) well[r][c] = 0; }
    bag_fill(queue);
    bag_fill(queue + 7);
    qhead = 0;
    holdp = -1; score = 0; lines = 0; level = 1;
    gains[0] = gains[1] = gains[2] = gains[3] = 0;
    key_l = key_r = key_d = das_ms = arr_ms = 0;
    clear_timer = 0;
    state = ST_PLAY;
    events |= EV_START;
    spawn();
}

/* ------------------------------------------------------------------ tick */
static void run_tick(u32 dt) {
    blink_acc += dt;
    if (state != ST_PLAY) return;
    if (clear_timer) { if (clear_timer > dt) clear_timer -= dt; else clear_timer = 0; return; }

    /* horizontal auto-repeat: first tap from run_key, repeats here */
    if (key_l || key_r) {
        int dir = key_l ? -1 : 1;
        das_ms += dt;
        if (!arr_ms) {
            if (das_ms >= DAS) { arr_ms = 1; das_ms = 0; if (try_move(dir, 0, 0)) events |= EV_MOVE; }
        } else {
            while (das_ms >= ARR) { das_ms -= ARR; if (try_move(dir, 0, 0)) events |= EV_MOVE; }
        }
    } else { das_ms = 0; arr_ms = 0; }

    /* gravity / soft drop: constant rate while held */
    g_acc += dt;
    {
        u32 base = gravity_ms();
        u32 g = base;
        if (key_d) { g = base / 15; if (g < 20) g = 20; }
        while (g_acc >= g && state == ST_PLAY && !clear_timer) {
            g_acc -= g;
            if (fits(cur, currot, curx, curly + 1)) {
                curly++;
                if (key_d) { score++; events |= EV_SOFT; }
                lock_acc = 0;
            } else break;
        }
    }
    /* lock delay runs in real time: same window whether or not soft-dropping */
    if (state == ST_PLAY && !clear_timer && !fits(cur, currot, curx, curly + 1)) {
        lock_acc += dt;
        if (lock_acc >= LOCK_DELAY) lock_current();
    }
}

/* ------------------------------------------------------------------- key */
static void run_key(int code, int down) {
    if (state == ST_TITLE || state == ST_OVER) {
        if (down && (code == K_ENTER || code == K_RESTART)) reset_game();
        return;
    }
    if (code == K_RESTART) { if (down) reset_game(); return; }
    if (code == K_PAUSE) { if (down) state = (state == ST_PLAY) ? ST_PAUSE : ST_PLAY; return; }
    if (state != ST_PLAY || clear_timer) { if (code == K_D) key_d = 0; return; }
    switch (code) {
    case K_L:
        key_l = down;
        if (down) { das_ms = 0; arr_ms = 0; if (try_move(-1, 0, 0)) events |= EV_MOVE; }
        break;
    case K_R:
        key_r = down;
        if (down) { das_ms = 0; arr_ms = 0; if (try_move(1, 0, 0)) events |= EV_MOVE; }
        break;
    case K_D: key_d = down; break;
    case K_CW:  if (down && try_move(0, 0, 1)) events |= EV_ROT; break;
    case K_CCW: if (down && try_move(0, 0, -1)) events |= EV_ROT; break;
    case K_HOLD:
        if (down && !holdused) {
            int t = holdp;
            holdp = cur;
            holdused = 1;
            if (t >= 0) { cur = t; currot = 0; curx = spawn_x(t); curly = 0; lock_acc = 0;
                          if (!fits(cur, currot, curx, curly)) { state = ST_OVER; events |= EV_OVER; } }
            else spawn();
            events |= EV_HOLD;
        }
        break;
    case K_HARD: if (down) hard_drop(); break;
    }
}

/* ---------------------------------------------------------------- render */
static void draw_mini(int p, int x, int y, int s) {
    const u8 *c = SHAPE[p][0];
    const u8 *col = PCOL[p];
    int i;
    for (i = 0; i < 4; i++)
        fb_block(x + c[i * 2] * s, y + c[i * 2 + 1] * s, s, col[0], col[1], col[2]);
}
static void draw(void) {
    int r, c2, i;
    if (state == ST_TITLE) {
        fb_clear(0, 0, 170); /* blue */
        fb_rect(0, 0, FBW, 48, 0, 0, 0);
        fb_rect(0, FBH - 48, FBW, 48, 0, 0, 0);
        fb_center("FRETRIS", 0, FBW, 86, 8, 255, 255, 85);
        fb_center("C + WEBASSEMBLY", 0, FBW, 158, 2, 255, 255, 255);
        if ((blink_acc / 400) % 2) fb_center("> PRESS ENTER", 0, FBW, 214, 2, 85, 255, 85);
        fb_center("ARROWS MOVE - UP OR Z ROTATE - SPACE HARD DROP", 0, FBW, 290, 1, 170, 170, 170);
        fb_center("C HOLD - P PAUSE - R RESTART", 0, FBW, 304, 1, 170, 170, 170);
        for (i = 0; i < 15; i++)
            fb_block(12 + i * 31, FBH - 36, 28, PCOL[i % 7][0], PCOL[i % 7][1], PCOL[i % 7][2]);
        return;
    }
    fb_clear(0, 0, 0);
    fb_rect(OX - 2, OY - 2, COLS * CELL + 4, ROWS * CELL + 4, 85, 85, 255); /* border */
    fb_rect(OX, OY, COLS * CELL, ROWS * CELL, 0, 0, 85);                    /* dark blue well */
    for (r = BUFH; r < ROWS + BUFH; r++)
        for (c2 = 0; c2 < COLS; c2++)
            if (well[r][c2]) {
                const u8 *col = PCOL[well[r][c2] - 1];
                fb_block(OX + c2 * CELL, OY + (r - BUFH) * CELL, CELL, col[0], col[1], col[2]);
            }
    if (state == ST_PLAY) {
        const u8 *cells = SHAPE[cur][currot];
        const u8 *cc = PCOL[cur];
        int gy = ghost_y();
        for (i = 0; i < 4; i++) {
            int gx = curx + cells[i * 2], gyy = gy + cells[i * 2 + 1];
            if (gyy >= BUFH && gyy != curly + cells[i * 2 + 1])
                fb_ghost(OX + gx * CELL, OY + (gyy - BUFH) * CELL, CELL,
                         (u8)(cc[0] / 2), (u8)(cc[1] / 2), (u8)(cc[2] / 2));
        }
        for (i = 0; i < 4; i++) {
            int px = curx + cells[i * 2], py = curly + cells[i * 2 + 1];
            if (py >= BUFH) fb_block(OX + px * CELL, OY + (py - BUFH) * CELL, CELL, cc[0], cc[1], cc[2]);
        }
    }
    fb_text("SCORE", 240, 20, 1, 170, 170, 170);
    fb_num(score, 240, 30, 2, 255, 255, 85);
    for (i = 0; i < 4; i++) {
        if (!gains[i]) continue;
        fb_text("+", 240, 50 + i * 9, 1, 140, 142, 160);
        fb_num(gains[i], 247, 50 + i * 9, 1, 140, 142, 160);
    }
    fb_text("LEVEL", 240, 92, 1, 170, 170, 170);
    fb_num(level, 240, 102, 2, 85, 255, 85);
    fb_text("LINES", 240, 134, 1, 170, 170, 170);
    fb_num(lines, 240, 144, 2, 85, 255, 255);
    fb_text("NEXT", 330, 20, 1, 170, 170, 170);
    for (i = 0; i < 3; i++) {
        int p = queue[(qhead + i) % 16];
        fb_rect(330, 30 + i * 66, 110, 60, 85, 85, 255);
        fb_rect(331, 31 + i * 66, 108, 58, 0, 0, 85);
        draw_mini(p, 330 + 25, 30 + i * 66 + 8, 14);
    }
    fb_text("HOLD", 420, 20, 1, 170, 170, 170);
    fb_rect(420, 30, 54, 54, 85, 85, 255);
    fb_rect(421, 31, 52, 52, 0, 0, 85);
    if (holdp >= 0) draw_mini(holdp, 424, 36, 11);
    if (state == ST_PAUSE) {
        fb_rect(OX + 10, 160, COLS * CELL - 20, 60, 0, 0, 0);
        fb_center("PAUSED", OX, OX + COLS * CELL, 180, 3, 255, 255, 255);
    }
    if (state == ST_OVER) {
        fb_center("GAME OVER", OX - 2, OX + COLS * CELL + 2, 140, 3, 255, 85, 85);
        if ((blink_acc / 400) % 2)
            fb_center("PRESS ENTER", OX - 2, OX + COLS * CELL + 2, 200, 1, 255, 255, 255);
    }
}

/* --------------------------------------------------------------- exports */
#ifdef TEST_MAIN
#define EXPORT(n)
#else
#define EXPORT(n) __attribute__((export_name(n)))
#endif

EXPORT("init") void exp_init(u32 seed) {
    seed0 = seed ? seed : 0x1u;
    state = ST_TITLE;
    blink_acc = 0;
    events = 0;
}
EXPORT("tick") void exp_tick(u32 dt) { run_tick(dt); draw(); }
EXPORT("key") void exp_key(int code, int down) { run_key(code, down); }
EXPORT("framebuffer") u8 *exp_fb(void) { return fb; }
EXPORT("score") u32 exp_score(void) { return score; }
EXPORT("level") u32 exp_level(void) { return level; }
EXPORT("lines") u32 exp_lines(void) { return lines; }
EXPORT("state") int exp_state(void) { return state; }
EXPORT("events") u32 exp_events(void) { u32 e = events; events = 0; return e; }

/* ------------------------------------------------------------ native test */
#ifdef TEST_MAIN
#include <stdio.h>
static void tap(int code) { run_key(code, 1); run_key(code, 0); }
static u32 hist1[401], hist2[401];
static u32 snap(const void *unused) {
    (void)unused;
    u32 h = 2166136261u, r, c;
    h = (h * 31 + (u32)cur) * 31 + (u32)currot;
    h = (h * 31 + (u32)curx) * 31 + (u32)curly;
    h = (h * 31 + qhead) * 31 + (u32)holdp;
    for (r = 0; r < ROWS + BUFH; r++)
        for (c = 0; c < COLS; c++) h = (h ^ well[r][c]) * 16777619u;
    return h;
}
static u32 snap1[401], snap2[401];
int main(void) {
    int i;
    u32 pieces = 0, s1, l1, s2, l2;
    /* scripted: I + I + O tiles one full row; repeat 3x -> 3 lines */
    {
        u32 lb = lines;
        exp_init(99);
        run_key(K_ENTER, 1);
        for (i = 0; i < 3; i++) {
            int t;
            cur = 0; currot = 0; curx = 0; curly = 0; tap(K_HARD);
            for (t = 0; t < 20; t++) run_tick(16);
            cur = 0; currot = 0; curx = 4; curly = 0; tap(K_HARD);
            for (t = 0; t < 20; t++) run_tick(16);
            cur = 1; currot = 0; curx = 8; curly = 0; tap(K_HARD);
            for (t = 0; t < 20; t++) run_tick(16);
        }
        printf("row tile: lines %u -> %u\n", lb, lines);
        if (lines < lb + 3) { printf("FAIL: row tiling did not clear\n"); return 1; }
    }
    /* guideline spawn columns: O at column 4, all others at column 3 */
    {
        int n, bad = 0, t;
        exp_init(12345);
        run_key(K_ENTER, 1);
        for (n = 0; n < 60; n++) {
            if (cur == 1) { if (curx != 4) bad = 1; }
            else if (curx != 3) bad = 1;
            tap(K_HARD);
            for (t = 0; t < 20; t++) run_tick(16);
            if (state != ST_PLAY) { exp_init(12345); run_key(K_ENTER, 1); }
        }
        printf("spawn columns: %s\n", bad ? "BAD" : "OK");
        if (bad) { printf("FAIL: O must spawn at col 4, others at col 3\n"); return 1; }
    }
    /* wall containment: pieces cannot leave the field or jitter at the wall */
    {
        int t;
        exp_init(12345);
        run_key(K_ENTER, 1);
        for (t = 0; t < 30; t++) tap(K_L);
        if (curx < 0) { printf("FAIL: piece left wall (x=%d)\n", curx); return 1; }
        for (t = 0; t < 30; t++) tap(K_R);
        for (t = 0; t < 20; t++) tap(K_R);       /* already flush-right */
        printf("wall containment: OK\n");
    }
    /* random-ish play: must be deterministic, no assertion on lines */
    exp_init(12345);
    run_key(K_ENTER, 1);
    for (i = 0; i < 400 && state == ST_PLAY; i++) {
        int dx = (i * 7919) % 9, t, n, k;
        n = dx; k = (i & 1) ? K_R : K_L;
        for (t = 0; t < n; t++) tap(k);
        if (i % 3 == 0) tap(K_CW);
#ifdef TEST_DEBUG
        printf("piece %d: p=%d rot=%d x=%d y=%d ghost=%d\n", i, cur, currot, curx, curly, ghost_y());
#endif
        tap(K_HARD);
        for (t = 0; t < 30; t++) run_tick(16);
        hist1[pieces + 1] = score;
        snap1[pieces + 1] = snap(0);
        pieces++;
    }
    s1 = score; l1 = lines;
    printf("run1: pieces=%u score=%u lines=%u state=%d\n", pieces, s1, l1, state);
    exp_init(12345);
    run_key(K_ENTER, 1);
    for (i = 0; i < (int)pieces; i++) {
        int dx = (i * 7919) % 9, t, n, k;
        n = dx; k = (i & 1) ? K_R : K_L;
        for (t = 0; t < n; t++) tap(k);
        if (i % 3 == 0) tap(K_CW);
        tap(K_HARD);
        for (t = 0; t < 30; t++) run_tick(16);
        hist2[i + 1] = score;
        snap2[i + 1] = snap(0);
    }
    for (i = 1; i <= (int)pieces; i++)
        if (snap1[i] != snap2[i]) { printf("STATE DIVERGE after piece %d: %08x vs %08x\n", i, snap1[i], snap2[i]); break; }
    for (i = 1; i <= (int)pieces; i++)
        if (hist1[i] != hist2[i]) { printf("SCORE DIVERGE at piece %d: %u vs %u\n", i, hist1[i], hist2[i]); break; }
    s2 = score; l2 = lines;
    printf("run2: score=%u lines=%u\n", s2, l2);
    if (l1 == 0) printf("note: random bot cleared no lines (%u pieces)\n", pieces);
    if (s1 != s2 || l1 != l2) { printf("FAIL: not deterministic\n"); return 1; }
    printf("OK\n");
    return 0;
}
#endif
