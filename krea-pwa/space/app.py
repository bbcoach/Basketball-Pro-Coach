import os, random
import gradio as gr
import torch
import spaces
from diffusers import Krea2Pipeline

# Pfad/ID des Krea-2-Turbo-Checkpoints (Space-Variable MODEL_ID setzen, siehe README)
MODEL_ID = os.environ.get("MODEL_ID", "krea/krea-2-turbo")

pipe = Krea2Pipeline.from_pretrained(
    MODEL_ID, torch_dtype=torch.bfloat16, token=os.environ.get("HF_TOKEN")
)
pipe.to("cuda")


@spaces.GPU(duration=60)
def generate(prompt, width, height, seed):
    seed = random.randint(0, 2**31 - 1) if seed is None or seed < 0 else int(seed)
    g = torch.Generator("cuda").manual_seed(seed)
    img = pipe(
        prompt=prompt,
        width=int(width),
        height=int(height),
        num_inference_steps=8,  # Turbo: 8 Schritte
        generator=g,
    ).images[0]
    return img, seed


demo = gr.Interface(
    generate,
    [
        gr.Textbox(label="Prompt"),
        gr.Slider(512, 1536, 1024, step=64, label="Breite"),
        gr.Slider(512, 1536, 1024, step=64, label="Höhe"),
        gr.Number(-1, label="Seed", precision=0),
    ],
    [gr.Image(type="filepath", label="Bild"), gr.Number(label="Seed")],
    api_name="generate",
)
demo.queue().launch()
