# Krea Studio (PWA + HF Space)

## 1. Backend (Hugging Face Space)
1. Neuen Space anlegen: SDK **Gradio**, Hardware **ZeroGPU** (benötigt HF Pro) oder eine bezahlte GPU. Sichtbarkeit: **Private**.
2. `space/app.py` und `space/requirements.txt` hochladen (app.py im Root des Space).
3. Space-Variable `MODEL_ID` auf den Krea-2-Turbo-Checkpoint setzen (siehe Diffusers-Doku zu Krea 2); ggf. Secret `HF_TOKEN`, falls die Gewichte eine Lizenzbestätigung brauchen.

## 2. Frontend (PWA)
Ordner `krea-pwa/` (ohne `space/`) statisch hosten, z. B. GitHub Pages oder Cloudflare Pages (HTTPS ist für PWAs nötig).
Auf dem Handy öffnen -> "Zum Startbildschirm hinzufügen". In den Einstellungen die Space-URL (`https://NAME-SPACE.hf.space`) und, bei privatem Space, einen HF-Token (Rolle "read") eintragen.
