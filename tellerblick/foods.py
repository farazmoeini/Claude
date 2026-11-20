"""Built-in food table: approximate values per 100 g (or 100 ml for drinks).

Rounded averages from common nutrition tables – good enough for everyday tracking,
not for medical use. portion = typical serving (grams, label).
"""
FOODS = [
    # name, kcal, protein, carbs, fat, (portion_g, portion_label)
    ("Haferflocken", 372, 13.5, 58.7, 7.0, (50, "5 EL")),
    ("Müsli (ungezuckert)", 360, 10, 60, 7, (60, "1 Schale")),
    ("Vollkornbrot", 215, 7, 40, 1.5, (50, "1 Scheibe")),
    ("Brötchen (Weizen)", 270, 9, 52, 2, (60, "1 Stück")),
    ("Toastbrot", 265, 8, 48, 4, (25, "1 Scheibe")),
    ("Croissant", 406, 8, 45, 21, (60, "1 Stück")),
    ("Reiswaffel", 387, 8, 81, 3, (8, "1 Stück")),
    ("Reis, gekocht", 130, 2.7, 28, 0.3, (180, "1 Portion")),
    ("Nudeln, gekocht", 150, 5.5, 30, 0.9, (200, "1 Portion")),
    ("Kartoffeln, gekocht", 77, 2, 17, 0.1, (200, "1 Portion")),
    ("Pommes frites", 290, 3.4, 35, 15, (150, "1 Portion")),
    ("Hähnchenbrust, gegart", 165, 31, 0, 3.6, (150, "1 Filet")),
    ("Rinderhackfleisch", 230, 20, 0, 16, (125, "1 Portion")),
    ("Bratwurst", 300, 13, 1, 27, (100, "1 Stück")),
    ("Kochschinken", 110, 19, 1, 3, (20, "1 Scheibe")),
    ("Salami", 380, 22, 1, 32, (10, "1 Scheibe")),
    ("Lachs, gegart", 208, 20, 0, 13, (125, "1 Filet")),
    ("Thunfisch (Dose, im eigenen Saft)", 116, 26, 0, 1, (140, "1 Dose")),
    ("Ei", 155, 13, 1.1, 11, (60, "1 Ei (M)")),
    ("Tofu natur", 120, 13, 2, 7, (100, "1 Portion")),
    ("Linsen, gekocht", 116, 9, 20, 0.4, (150, "1 Portion")),
    ("Kichererbsen, gekocht", 164, 9, 27, 2.6, (150, "1 Portion")),
    ("Hummus", 170, 8, 14, 10, (50, "2 EL")),
    ("Magerquark", 67, 12, 4, 0.3, (250, "1 Becher")),
    ("Skyr natur", 63, 11, 4, 0.2, (150, "1 Becher")),
    ("Joghurt 3,5 %", 64, 3.4, 4.7, 3.5, (150, "1 Becher")),
    ("Griechischer Joghurt 10 %", 120, 4, 4, 10, (150, "1 Becher")),
    ("Milch 3,5 %", 64, 3.4, 4.8, 3.5, (200, "1 Glas")),
    ("Haferdrink", 45, 1, 7, 1.5, (200, "1 Glas")),
    ("Gouda", 356, 25, 0, 27, (30, "1 Scheibe")),
    ("Mozzarella", 250, 18, 1, 19, (125, "1 Kugel")),
    ("Butter", 741, 0.7, 0.6, 83, (10, "1 Portion")),
    ("Olivenöl", 884, 0, 0, 100, (10, "1 EL")),
    ("Erdnussbutter", 588, 25, 20, 50, (15, "1 EL")),
    ("Mandeln", 576, 21, 22, 49, (30, "1 Handvoll")),
    ("Nuss-Nougat-Creme", 539, 6.3, 57.5, 30.9, (15, "1 EL")),
    ("Banane", 89, 1.1, 20, 0.3, (120, "1 Stück")),
    ("Apfel", 52, 0.3, 12, 0.2, (150, "1 Stück")),
    ("Orange", 47, 0.9, 9.4, 0.1, (150, "1 Stück")),
    ("Beeren, gemischt", 45, 1, 8, 0.4, (125, "1 Schale")),
    ("Avocado", 160, 2, 2, 15, (80, "1/2 Avocado")),
    ("Tomate", 18, 0.9, 3, 0.2, (100, "1 Stück")),
    ("Gurke", 15, 0.6, 2, 0.1, (100, "1/4 Gurke")),
    ("Paprika", 30, 1, 5, 0.3, (150, "1 Stück")),
    ("Brokkoli", 34, 2.8, 4, 0.4, (200, "1 Portion")),
    ("Möhre", 41, 0.9, 7, 0.2, (80, "1 Stück")),
    ("Blattsalat", 15, 1.3, 1.5, 0.2, (80, "1 Schale")),
    ("Pizza Margherita", 240, 10, 30, 9, (350, "1 Pizza")),
    ("Döner Kebab", 215, 12, 20, 10, (400, "1 Döner")),
    ("Burger (Fast Food)", 250, 13, 25, 11, (220, "1 Burger")),
    ("Spaghetti Bolognese", 150, 7, 18, 5, (400, "1 Teller")),
    ("Vollmilchschokolade", 535, 7.6, 59, 30, (25, "1 Riegel")),
    ("Fruchtgummi", 343, 6.9, 77, 0.1, (50, "1 Handvoll")),
    ("Kartoffelchips", 536, 6, 53, 34, (50, "1 Handvoll")),
    ("Proteinpulver (Whey)", 380, 75, 8, 6, (30, "1 Shake")),
    ("Cola", 42, 0, 10.6, 0, (330, "1 Dose")),
    ("Apfelsaft", 46, 0.1, 11, 0.1, (250, "1 Glas")),
    ("Bier", 43, 0.5, 3.6, 0, (500, "1 Flasche")),
]


def search(q: str, limit: int = 15) -> list[dict]:
    q = q.lower().strip()
    out = []
    for name, kcal, p, c, f, (pg, pl) in FOODS:
        n = name.lower()
        if not q or q in n or any(w.startswith(q) for w in n.replace(",", " ").split()):
            rank = 0 if n.startswith(q) else 1
            out.append((rank, {"name": name, "kcal": kcal, "protein": p, "carbs": c, "fat": f,
                               "portion_g": pg, "portion_label": pl}))
    out.sort(key=lambda x: (x[0], x[1]["name"]))
    return [x[1] for x in out[:limit]]
