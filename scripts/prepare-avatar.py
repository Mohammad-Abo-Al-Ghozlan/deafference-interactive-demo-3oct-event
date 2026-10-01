"""Prepare the supplied GLB for web delivery without changing its mesh or rig.

Usage: python scripts/prepare-avatar.py input.glb public/models/avatar.glb
Requires Pillow. This is an optional asset preparation step, not an npm dependency.
"""
import hashlib
import io
import json
from pathlib import Path
import struct
import sys

from PIL import Image

source, destination = map(Path, sys.argv[1:3])
data = source.read_bytes()
magic, version, total = struct.unpack_from('<4sII', data)
assert magic == b'glTF' and version == 2 and total == len(data)
json_size, json_type = struct.unpack_from('<I4s', data, 12)
assert json_type == b'JSON'
document = json.loads(data[20:20 + json_size])
binary_size, binary_type = struct.unpack_from('<I4s', data, 20 + json_size)
assert binary_type == b'BIN\0'
binary = data[28 + json_size:28 + json_size + binary_size]
image_views = {image['bufferView'] for image in document['images']}
assert len(document['textures']) == 1, 'Expected the supplied single-texture avatar'
webp_image = document['images'][document['textures'][0]['extensions']['EXT_texture_webp']['source']]
view = document['bufferViews'][webp_image['bufferView']]
offset = view.get('byteOffset', 0)
image = Image.open(io.BytesIO(binary[offset:offset + view['byteLength']]))
image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
image_bytes = io.BytesIO()
image.save(image_bytes, 'WEBP', quality=95, method=6)

output = bytearray()
views = []
view_map = {}
for index, original in enumerate(document['bufferViews']):
    if index in image_views:
        continue
    output.extend(b'\0' * (-len(output) % 4))
    updated = dict(original)
    updated['byteOffset'] = len(output)
    original_offset = original.get('byteOffset', 0)
    output.extend(binary[original_offset:original_offset + original['byteLength']])
    view_map[index] = len(views)
    views.append(updated)
for accessor in document['accessors']:
    if 'bufferView' in accessor:
        accessor['bufferView'] = view_map[accessor['bufferView']]
output.extend(b'\0' * (-len(output) % 4))
texture_data = image_bytes.getvalue()
views.append({'buffer': 0, 'byteOffset': len(output), 'byteLength': len(texture_data)})
output.extend(texture_data)
document['images'] = [{**webp_image, 'bufferView': len(views) - 1}]
document['bufferViews'] = views
document['buffers'] = [{'byteLength': len(output)}]
document['textures'][0].pop('source', None)
document['textures'][0]['extensions']['EXT_texture_webp']['source'] = 0
document['extensionsRequired'] = sorted(set(document.get('extensionsRequired', [])) | {'EXT_texture_webp'})
document['asset']['extras'] = {
    **document['asset'].get('extras', {}),
    'source_sha256': hashlib.sha256(data).hexdigest(),
    'texture_preparation': '2048px WebP quality 95; duplicate JPEG fallback removed; mesh and rig unchanged',
}
json_bytes = json.dumps(document, separators=(',', ':')).encode()
json_bytes += b' ' * (-len(json_bytes) % 4)
output.extend(b'\0' * (-len(output) % 4))
header = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(json_bytes) + 8 + len(output))
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_bytes(header + struct.pack('<I4s', len(json_bytes), b'JSON') + json_bytes + struct.pack('<I4s', len(output), b'BIN\0') + output)
print(json.dumps({'source_bytes': len(data), 'web_bytes': destination.stat().st_size, 'texture_size': image.size, 'source_sha256': document['asset']['extras']['source_sha256']}))
