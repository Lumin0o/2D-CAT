# Esquisse 2D — PWA d'esquisse façon SOLIDWORKS

Étapes 1 et 2 sur 4 terminées (base, contraintes et cotes). Version 0.2.3.

## Retours iPhone intégrés (0.2.1 – 0.2.2)

- Rectangle par le centre et rectangle 3 points centre : deux diagonales de construction, le point centre (par ex. l'origine) est au milieu d'une diagonale → il reste au centre quand on change les cotes.
- Cotation intelligente : pour une ligne inclinée ou deux points, la cote est horizontale (placée au-dessus / en dessous), verticale (à gauche / à droite) ou parallèle (à côté, ou dans les coins).
- Saisie directe de la valeur dès qu'une cote est créée (Annuler garde la valeur mesurée).
- Cote sélectionnée : « Rendre pilotée » / « Rendre pilotante ». Une cote rendue pilotante qui sur-contraint passe en rouge ; on rend une autre cote pilotée ou on supprime une relation.
- Conflit persistant : une valeur ou une relation impossible est gardée (hors calcul) ; la cote ou la relation et les traits concernés restent en rouge, avec « Sur-contrainte », jusqu'à résolution (autre valeur, cote pilotée, relation supprimée, annuler). Le reste de l'esquisse reste manipulable.
- Inversion du sens d'une cote : bouton ⇅ du clavier, ou valeur négative (sauf si ça sur-contraint).
- Clavier : virgule à gauche du 0 ; le OK ne déclenche plus le bouton situé dessous (Réglages).
- « Aimanter à la grille » : interrupteur sous « Grille », utilisable seulement quand la grille est affichée.
- Solveur : amortissement par équation (une modification de cote pouvait être refusée à tort, « Trop de contraintes »), et nouvel essai sans préférence de déplacement si besoin.
- Démarrage : le stockage IndexedDB ne peut plus bloquer l'app (délai de 2,5 s) ; si l'app ne démarre pas, un écran explique l'erreur au lieu d'un écran vide. État « Hors ligne » visible dans Réglages › À propos.

## Retours iPhone intégrés (0.2.3)

- Première cote : tant qu'il n'y a pas d'autre cote pilotante (y compris après les avoir toutes supprimées), sa valeur met toute l'esquisse à l'échelle autour de l'origine, comme SOLIDWORKS. Les cotes suivantes ne modifient que ce qu'elles cotent.
- Groupe Cotation : Cote horizontale, Cote verticale et Cotation en chaîne (deux points, on place la ligne de cote, puis chaque point touché ajoute une cote alignée depuis le point précédent ; tap dans le vide pour finir).
- Barre d'outils réduite : une case ne peut plus rester bloquée après un appui dont le relâchement a été perdu (souvent après un appui long).
- Corbeille déplacée au-dessus de « Tout afficher ».
- Bandeau d'infos : un texte long passe à la ligne au lieu d'élargir l'écran (les boutons du bas et de droite étaient coupés).
- « Aimantation et grille » et « Fichiers » : retoucher le bouton ferme la fenêtre (elle se rouvrait aussitôt).
- Grille façon papier millimétré : lignes fines, plus marquées tous les 5 et 10 pas ; l'aimantation suit les lignes bien visibles.
- Démarrage : écran « Chargement de l'app… » avec le nombre de fichiers reçus quand le serveur est lent (au lieu d'un faux écran d'erreur au bout de 9 s) ; erreur seulement si plus rien n'arrive pendant 25 s. Une fois l'app lancée, message « Préparation du mode hors ligne… » puis « Prête » ; le service worker réessaie chaque fichier.

## Tester sur ordinateur

```sh
cd "CAO PWA"
python3 -m http.server 8080
```

Puis ouvrir http://localhost:8080. La molette zoome, la souris remplace le doigt.

## Tester sur iPhone (installation hors ligne)

Le service worker exige HTTPS. Déposer le dossier tel quel sur un hébergeur statique
(GitHub Pages, Netlify, Vercel, Cloudflare Pages), ouvrir l'adresse dans Safari,
puis Partager → « Sur l'écran d'accueil ». Lancer l'app une fois avec du réseau :
tous les fichiers sont alors en cache.

## Tests automatiques (cœur, sans navigateur)

```sh
./test/run.sh
```

## Organisation du code

- `js/core/` : modèle géométrique, requêtes, historique, unités, calculatrice, solveur (couche indépendante)
- `js/render/` : fenêtre de vue, rendu Canvas, mise en page des cotes et icônes de relations
- `js/ui/` : gestes, barre d'outils, bandeau, relations, clavier calculatrice, fenêtres, réglages, outils
- `js/store/` : IndexedDB et réglages
- `sw.js` : cache hors ligne. À chaque version, changer `CACHE` et tenir `ASSETS` à jour.

## Solveur

Gauss-Newton amorti, pas de norme minimale pondérée : la géométrie bouge le moins possible
et les éléments « lourds » (point glissé, origine d'une entité modifiée) restent en place.
Les degrés de liberté et les redondances viennent d'une orthogonalisation de la jacobienne.
Les tests sont dans `test/solver.test.js`.
