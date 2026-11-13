import json
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image


def render_sheet(raw, size, frames, palette):
    width, height = size, size * frames
    if raw.startswith(b"BM"):
        image = Image.open(BytesIO(raw)).convert("RGB")
        if image.width != width or image.height < height:
            raise ValueError(f"Unexpected bitmap size {image.size}")
        image = image.crop((0, 0, width, height))
        alpha = Image.new("L", image.size)
        alpha.putdata([0 if color == (247, 0, 255) else 255 for color in image.get_flattened_data()])
        image.putalpha(alpha)
        return image

    if len(raw) < width * height:
        raise ValueError(f"Truncated indexed image ({len(raw)} bytes)")
    image = Image.frombytes("P", (width, height), raw[:width * height])
    image.putpalette(palette)
    image.info["transparency"] = 0
    return image.convert("RGBA")


def render(root):
    source = json.loads((root / "index.json").read_text(encoding="utf-8"))
    palette = (root / "palette.bin").read_bytes()
    rgb = bytes(channel for b, r, g in zip(palette[::3], palette[1::3], palette[2::3]) for channel in (r, g, b))
    manifest = {"portraits": source["portraits"]}
    (root / "units").mkdir()
    for kind, size, frames in [("units", 48, 9), ("attack", 64, 12), ("special", 48, 5)]:
        files = {}
        for key, index in source["mappings"].items():
            raw = root / f"{kind}-{index}.bin"
            if not raw.exists():
                continue
            image = render_sheet(raw.read_bytes(), size, frames, rgb)
            if not image.getbbox():
                continue
            suffix = "" if kind == "units" else f"-{kind}"
            file = f"units/{key}{suffix}.png"
            image.save(root / file)
            files[key] = file
        manifest[kind] = files
    manifest["officerSprites"] = {
        name: key for name, key in source["officerSprites"].items() if key in manifest["units"]
    }
    (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    render(Path(sys.argv[1]))
