# Film-Messdaten

Kontrast und Korn der Kodak-Film-Looks stammen aus öffentlichen Kodak-Datenblättern (Technical Data Sheets).
Die PDFs sind nicht im Repo (Urheberrecht). `curves.json` enthält die ausgelesenen Kennlinien, `digitize.py` liest sie
aus den Vektordaten der PDFs (pdfplumber), nicht aus Bildern.

## Was gemessen wurde

Kennlinie = Dichte über log. Belichtung je Farbschicht (R, G, B). Steigung (γ) zwischen log E −2,0 und 0,0.

| Film | Datenblatt | γ R | γ G | γ B | γ G relativ zu Portra 400 | Korn-Index (35 mm, 8×10) |
|---|---|---|---|---|---|---|
| Portra 400 | E-4050 | 0,558 | 0,560 | 0,649 | 1,000 | 59 |
| Portra 160 | E-4051 | 0,529 | 0,544 | 0,605 | 0,971 | 50 |
| Portra 800 | E-4040 | 0,553 | 0,559 | 0,648 | 0,999 | 70 |
| Ektar 100 | E-4046 | 0,558 | 0,583 | 0,666 | 1,043 | 38 |
| Gold 200 | E-7022 | 0,545 | 0,565 | 0,593 | 1,010 | 66 (aus 44 bei 4×6 hochgerechnet, +22) |
| Ultra Max 400 | E-7023 | 0,511 | 0,530 | 0,596 | 0,947 | 68 (aus 46 bei 4×6 hochgerechnet, +22) |

Tri-X 400 (F-4017): diffuse rms-Granularität 17. Das ist ein anderer Maßstab und nicht mit dem Korn-Index vergleichbar.

## Wie das in die Looks eingeht

* **Kontrast:** Die S-Kurve in `buildSynth` hat die Mittensteigung 1 + 0,66·c. Portra 400 ist auf c = 0,30 gesetzt
  (Annahme, das hängt von Papier und Scan ab). Die anderen Filme skalieren mit ihrer gemessenen Steigung:
  Portra 160 → 0,247, Ektar → 0,372, Gold 200 → 0,318, Ultra Max 400 → 0,203.
* **Korn:** Print-Grain-Index (PGI): 4 Einheiten sind ein gerade erkennbarer Unterschied (Kodak). Annahme: eine
  Verdopplung der Vergrößerung verdoppelt die sichtbare Körnigkeit. Portra 400 steigt von 4×6 auf 8×10 um 22 PGI,
  also gilt 1,0328 pro PGI-Einheit. Verankert ist Portra 400 bei Regler 0,14 (Standardabweichung ≈ 0,010 im Mittelgrau,
  so fein wie in den Referenzbildern). Daraus: Ektar 0,07, Portra 160 0,105, Portra 800 0,20, Gold 0,176, Ultra Max 0,187.

## Was NICHT aus den Datenblättern folgt

* **Farbwiedergabe.** Das Blatt enthält nur die Summe der Farbstoffe (Midscale Neutral) und die Spektralempfindlichkeit,
  nicht die einzelnen Farbstoffkurven, die Kopplung zwischen den Schichten (DIR-Koppler) und nicht das Papier. Die
  Farbtöne der Looks sind deshalb Beschreibungen, keine Messung.
* **Die Schicht-Steigungen B/G = 1,05–1,16 werden nicht übernommen.** Farbpapier ist so abgestimmt, dass Grautöne
  neutral bleiben. Ein roher Übertrag würde einen falschen Farbstich erzeugen.
* **Papier und Scan** bestimmen den größten Teil des Kontrastverlaufs. Der Kontrast-Anker (0,30) ist eine Annahme.
* Cinestill 800T (Kodak-Kinofilm 5219 ohne Remjet): Die Kurven aus dem Datenblatt waren nicht verlässlich auswertbar.
  Fuji-Filme wurden nicht ausgewertet.
