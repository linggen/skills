#!/usr/bin/env python3
"""pin.py — where a real place falls on the world map, as a place's `map`.

    python3 tools/pin.py 118.30 36.85        # lon lat → [x, y], fractions of the map

The map (art/map/jiuzhou.svg, 1440.26 × 1055.536) is a drawing, not a
projection: fitted over the whole of China it is 20–30 px out. So the fit is
an affine over the marks the plate itself carries, corrected toward the
nearest marks (inverse distance), which puts each mark exactly on itself and
the east within a few px. The answer is a start: look at the place on the
map and nudge it by hand — onto its coast, off a neighbour, inside the frame.
"""
import sys

W, H = 1440.26, 1055.536
# (lon, lat, x, y): the plate's own marks and their real places.
MARKS = [
    (116.09, 35.40, 1071.7, 458.7),   # 巨野, a dot
    (117.10, 36.26, 1150.4, 370.0),   # 岱山 = 泰山, a peak
    (118.72, 34.73, 1251.4, 477.0),   # 羽山, a peak
    (120.20, 31.20, 1330.0, 718.0),   # 震泽 = 太湖, the lake
    (111.93, 36.57, 835.9, 315.5),    # 太岳山, a peak
    (111.55, 31.73, 775.4, 664.5),    # 荆山, a peak
    (112.60, 31.05, 846.0, 737.2),    # 内方山, a peak
    (107.64, 34.47, 601.9, 438.5),    # 岐山, a peak
    (104.07, 30.66, 384.7, 698.7),    # 成都, a dot
    (104.21, 35.14, 383.0, 419.7),    # 渭源, a dot
]


def solve3(m, v):
    """Cramer's rule for a 3×3 system."""
    def det(a):
        return (a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
                - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
                + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]))
    d = det(m)
    out = []
    for i in range(3):
        mi = [row[:] for row in m]
        for r in range(3):
            mi[r][i] = v[r]
        out.append(det(mi) / d)
    return out


def affine():
    rows = [(lon, lat, 1.0) for lon, lat, _, _ in MARKS]
    ata = [[sum(r[i] * r[j] for r in rows) for j in range(3)] for i in range(3)]
    cx = solve3(ata, [sum(r[i] * m[2] for r, m in zip(rows, MARKS)) for i in range(3)])
    cy = solve3(ata, [sum(r[i] * m[3] for r, m in zip(rows, MARKS)) for i in range(3)])
    return cx, cy


def pin(lon, lat):
    cx, cy = affine()
    at = lambda a, b, c: (c[0] * a + c[1] * b + c[2])
    x, y = at(lon, lat, cx), at(lon, lat, cy)
    wsum = dx = dy = 0.0
    for mlon, mlat, mx, my in MARKS:
        d2 = (lon - mlon) ** 2 + (lat - mlat) ** 2
        if d2 < 1e-9:
            return [round(mx / W, 4), round(my / H, 4)]
        w = 1 / d2
        wsum += w
        dx += w * (mx - at(mlon, mlat, cx))
        dy += w * (my - at(mlon, mlat, cy))
    return [round((x + dx / wsum) / W, 4), round((y + dy / wsum) / H, 4)]


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    print(pin(float(sys.argv[1]), float(sys.argv[2])))
