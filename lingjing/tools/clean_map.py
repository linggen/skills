#!/usr/bin/env python3
"""clean_map.py — the world map as the game shows it: the plate's land, seas,
borders and rivers, and none of its words.

    python3 tools/clean_map.py worlds/jiuding/art/plates/yugong-jiuzhou.svg worlds/jiuding/art/map/jiuzhou.svg

The plate is Wikimedia Commons' "Yugong Nine Provinces Map 禹贡九州图.svg"
(Philg88, CC BY-SA 3.0). Kept: its areas, sea hatching, coastlines, borders,
lakes and rivers. Dropped: every label (the page writes the game's own names
over it), the title, legend, scale, inset, mountain marks, the frame and every
embedded raster (the Illustrator export points at files it never shipped).
A white ground goes under it all, as the plate's missing raster was.
"""
import sys
import xml.etree.ElementTree as ET

SVG, XLINK = 'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', XLINK)
KEEP = {'Areas', 'Sea_Hatch', 'Coastline', 'Borders', 'Lakes_and_Rivers'}
WORDS = {'text', 'image', 'circle'}


def tag(e):
    return e.tag.split('}')[-1]


def strip(parent):
    for child in list(parent):
        if tag(child) in WORDS:
            parent.remove(child)
        else:
            strip(child)


def clean(src, out):
    tree = ET.parse(src)
    root = tree.getroot()
    for child in list(root):
        if child.get('id') not in KEEP:
            root.remove(child)
    strip(root)
    # The provinces are tints at a fifth of their colour: they need the
    # plate's white under them, which the export left to a missing raster.
    w, h = root.get('viewBox').split()[2:]
    root.insert(0, ET.Element(f'{{{SVG}}}rect', {'width': w, 'height': h, 'fill': '#FFFFFF'}))
    for k in ('x', 'y', 'enable-background', '{http://www.w3.org/XML/1998/namespace}space'):
        root.attrib.pop(k, None)
    root.set('id', 'jiuzhou')
    tree.write(out, encoding='utf-8', xml_declaration=True)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    clean(sys.argv[1], sys.argv[2])
