# Latent Weighted Blend Resize

A custom ComfyUI node that blends two latent inputs using independently adjustable weights while automatically handling latent shape mismatches through resizing.

Designed primarily for workflows involving:
- Z Image Turbo
- SD3
- Flux
- Image-to-Image blending
- Style mixing
- Portrait/Landscape latent combinations

---

## Features

### Weighted Latent Blending
Unlike traditional latent blend nodes that use a single blend factor, this node allows independent weighting of both latent inputs.

Example:

- Latent A Weight = 0.75
- Latent B Weight = 0.25

This provides finer control over which image contributes more strongly to the final result.

---

### Automatic Latent Resizing

When blending latents generated from images with different aspect ratios or resolutions, shape mismatches commonly occur.

This node automatically:

- Detects latent size differences
- Resizes both latent tensors to a user-specified target resolution
- Preserves latent channel structure
- Prevents common blend errors

Examples:

Before:

```
[1,16,128,123]
[1,16,128,97]
```

After:

```
[1,16,128,128]
[1,16,128,128]
```

---

### Resolution Control

Built-in width and height controls allow users to explicitly define the output latent size.

This helps maintain consistency across:

- Portrait workflows
- Landscape workflows
- Video workflows
- Multi-image blending pipelines

---

## Inputs

| Input | Type | Description |
|---------|---------|---------|
| samples1 | LATENT | First latent input |
| samples2 | LATENT | Second latent input |
| weight1 | FLOAT | Weight applied to first latent |
| weight2 | FLOAT | Weight applied to second latent |
| width | INT | Target latent width |
| height | INT | Target latent height |

---

## Outputs

| Output | Type |
|----------|----------|
| LATENT | Blended latent output |

---

## Blend Formula

The node normalizes the weights before blending:

```python
total = weight1 + weight2

w1 = weight1 / total
w2 = weight2 / total

output = latent1 * w1 + latent2 * w2
```

Examples:

### Equal Blend

```
weight1 = 1.0
weight2 = 1.0
```

Result:

```
50% latent1
50% latent2
```

### Bias Toward First Image

```
weight1 = 0.80
weight2 = 0.20
```

Result:

```
80% latent1
20% latent2
```

---

## Typical Workflow

```text
Image A
   ↓
VAE Encode
   ↓
        Latent Weighted Blend Resize
   ↑
VAE Encode
   ↑
Image B

        ↓
     KSampler

        ↓
     VAE Decode
```

---

## Common Use Cases

### Style Mixing

Combine:

- Subject from Image A
- Lighting from Image B

### Character Variations

Blend:

- Two generated characters
- Different outfits
- Different poses

### Z Image Turbo

Mix multiple source images before generation while controlling influence from each source.

### Portrait / Landscape Correction

Blend images with different aspect ratios without manually resizing them beforehand.

---

## Notes

- This node operates entirely in latent space.
- Latent inputs must have matching channel counts.
- The node resizes latent spatial dimensions only.
- Batch operations have been intentionally removed to simplify workflows and improve compatibility.

---

## Compatibility

Tested with:

- ComfyUI
- SD3-based workflows
- Z Image Turbo workflows
- Flux workflows

---

## License

MIT License

---

## Disclaimer

This node was created as a utility to simplify latent blending workflows and reduce shape mismatch issues commonly encountered when mixing images of different sizes and aspect ratios.