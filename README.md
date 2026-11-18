# Esquisse 2D — PWA d'esquisse façon SOLIDWORKS

Étapes 1, 2 et 3 sur 4 terminées (base, contraintes et cotes, outils complémentaires). Version 0.3.7.

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

## Retours iPhone intégrés (0.2.4)

- Cotation ordinale (groupe Cotation) : on touche la référence (sommet, ligne, arc ou cercle → centre), un tap dans le vide place la cote 0 (au-dessus / en dessous : cotes en X ; à gauche / à droite : cotes en Y), puis chaque élément touché reçoit sa cote depuis la référence, alignée sur la cote 0. Glisser une de ces cotes déplace toute la ligne ; supprimer la cote 0 supprime ses cotes.
- Barre d'outils développée : sa taille suit son contenu (elle s'arrête au dernier groupe, en portrait comme en paysage).
- Réglages : 5 à 8 cases par ligne dans la barre réduite (10 à 16 en 2 lignes).
- Rangée du bas : icônes seules ; nouveau bouton Grille (marche / arrêt) à droite de l'Aimantation. La fenêtre Aimantation garde « Aimant » et « Aimanter à la grille ».
- Grille : gris sombre en thème sombre, gris clair en thème clair.
- Réglages › Tracé › Poser les points : Touchers (un toucher par point), Glisser (glisser-lâcher du premier au deuxième point ; le troisième éventuel au toucher) ou Les deux. En glisser-lâcher, la ligne trace un seul segment.

## Retours iPhone intégrés (0.2.5)

- Cotes ordinales : flèches comme les cotes normales. Sur la ligne de la cote 0, un trait relie chaque cote à la précédente (du même côté du 0) avec une flèche sur sa ligne d'attache ; la première a une flèche à chaque bout (0 ↔ cote). La valeur est placée juste après ce trait.
- Fenêtre Aimantation : sous « Aimant », un interrupteur par type (extrémités et centres, milieux, quadrants, intersections, sur les entités, horizontale, verticale, tangence des arcs, grille). Couper un type coupe aussi la relation automatique correspondante. Quand « Aimant » est coupé, tous les types sont grisés et inactifs, grille comprise. « Grille » reste réglable quand la grille est masquée (il n'agit que grille affichée).

## Ajout (0.2.6)

- Outil Point (groupe Point, barre développée) : un toucher pose un point d'esquisse isolé. Il s'accroche comme les autres outils (milieu → point milieu, sur une entité ou une intersection → coïncident) et peut ensuite être coté, relié par des relations, déplacé ou servir d'extrémité à une ligne. Supprimer une entité qui l'utilise ne le supprime pas. Un seul toucher suffit, quel que soit le réglage « Poser les points ».

## Retours iPhone intégrés (0.2.7)

- Loupe de précision : un petit rectangle en haut de la loupe affiche la cote de ce qu'on est en train de tracer, dans l'unité des réglages — longueur (ligne, ligne par le milieu : longueur totale), largeur × hauteur (rectangles, parallélogramme ; d'abord la longueur du premier côté pour les outils 3 points), R (cercles, arcs ; plus l'angle pour l'arc centre et extrémités), X · Y depuis l'origine (outil Point). Sous la loupe s'il n'y a pas la place au-dessus.

## Retours iPhone intégrés (0.2.8)

- Le rectangle de cote est à cheval sur le haut de la loupe (sur le bas si la loupe touche le haut de l'écran).
- Point d'esquisse : dessiné en astérisque, de la taille des extrémités ; même forme pour l'aperçu et l'icône de l'outil.

## Étape 3 : outils complémentaires (0.3.0)

- **Ligne de construction** : comme la ligne, en pointillés (repère, non exportée à l'étape 4). **Basculer en construction** : toucher une entité la fait passer de trait normal à construction et inversement ; si des entités sont sélectionnées avant de choisir l'outil, elles basculent toutes.
- **Mètre** : deux points (aimantés) → distance, ΔX, ΔY et angle dans le bandeau ; une entité → longueur, rayon, diamètre, angle, longueur d'arc. Rien n'est ajouté à l'esquisse. Pendant le choix du deuxième point, la loupe affiche la distance.
- **Ajuster intelligent** : toucher une portion la supprime jusqu'aux intersections voisines (toute l'entité si elle n'en a pas ; un cercle demande deux intersections). Balayer le doigt à travers plusieurs entités les ajuste toutes, en un seul « annuler ». Les nouvelles extrémités sont coïncidentes avec l'entité qui coupe ; une ligne coupée au milieu donne deux morceaux colinéaires.
- **Prolonger** : toucher une ligne ou un arc près du bout à prolonger ; il va jusqu'à la première entité rencontrée (bout libre seulement).
- **Décaler** : toucher le contour (les entités reliées bout à bout sont prises ensemble), puis le côté ; l'aperçu suit le doigt et la distance se saisit au clavier. Coins raccordés, lignes parallèles à l'original, arcs concentriques.
- **Symétrie** (anciennement Miroir) : toucher les éléments à copier, Valider, puis toucher la ligne de symétrie. Les points sur l'axe sont partagés, les autres reçoivent une relation de symétrie (la copie suit l'original).
- **Congé** / **Chanfrein** : toucher un coin (point qui relie deux lignes) ou deux lignes, puis le rayon / la distance au clavier. Avec une sélection (par ex. un rectangle encadré), tous ses coins sont traités d'un coup. Congé tangent aux deux lignes.
- **Déplacer** / **Copier** : sélection (ou toucher les éléments puis Valider), point de départ puis point d'arrivée (aimantés), avec aperçu. Les liens avec le reste de l'esquisse sont retirés (comme SOLIDWORKS sans « garder les relations »). Copier reste actif pour d'autres copies.
- **Pivoter** : sélection, centre de rotation, puis l'angle au clavier (positif = sens inverse des aiguilles d'une montre). Relations H / V échangées pour un quart de tour, retirées pour un angle quelconque.
- **Sélection** : bouton **cadre** à côté de la sélection multiple. Cadre vers la droite = fenêtre bleue (éléments entièrement dedans), vers la gauche = capture verte pointillée (éléments touchés) ; il prend aussi les cotes et les points isolés, et s'ajoute à la sélection. Sans mode actif (ni multiple, ni cadre) : sélection simple, et glisser un doigt dans le vide déplace la vue ; en sélection multiple aussi.
- **Plein écran** : petit bouton en haut à droite du dessin ; masque la barre d'outils, le bandeau et les boutons. Le même bouton, discret, permet d'en sortir.
- Correction du solveur : la tangence d'un arc qui part du bout d'une ligne (arc tangent, congé) était jugée redondante et pouvait disparaître ; elle s'écrit maintenant « rayon perpendiculaire à la ligne » au point de contact.
- Les calculs (ajuster, prolonger, décaler, miroir, congé, chanfrein, transformations) sont dans `js/core/edit.js`, testés dans `test/edit.test.js`. Toute opération qui rendrait l'esquisse impossible à résoudre est annulée avec un message.

## Retours iPhone intégrés (0.3.1)

- Mètre : mesure en pointillés verts.
- Activer la sélection multiple ou le cadre quitte l'outil en cours. Un cadre retire de la sélection les éléments qui y étaient déjà (bascule).
- **Ligne de construction par le milieu** (groupe Construction).
- **Cote symétrique** : une cote entre un élément et une ligne de construction, placée de l'autre côté de cette ligne, vaut deux fois la distance (comme le diamètre de SOLIDWORKS). Elle est dessinée de l'élément à son image.
- **Valider** prend la place de la corbeille (les deux ne sont jamais visibles en même temps : l'outil reprend la sélection). En plein écran, il rejoint les autres actions sous l'indication.
- Miroir : après le choix de l'axe, aperçu de la copie puis **Valider** ; toucher une autre ligne change l'axe.
- Décaler : petite fenêtre d'options sous la barre d'outils (gardées dans les réglages) : **Sélectionner la chaîne** (entités reliées bout à bout, sans les lignes de construction), **Ajouter une cote** (active par défaut ; cote de la distance + relations « décalage identique » D : tout le contour suit la cote ; pour un cercle ou des arcs seuls, cote de rayon de la copie), **Construction**.
- Barre réduite : la dernière case affiche le dernier groupe utilisé qui n'a pas déjà sa case (réglages : « Case n · Dernier groupe utilisé »).
- Glisser un point sur une entité (ligne, cercle, arc, milieu, intersection) l'y aimante ; au lâcher, il devient coïncident (ou point milieu), comme pendant le tracé.

## Retours iPhone intégrés (0.3.2)

- Cases de la barre de relations moins hautes.
- **Ligne infinie** (groupe Construction) : une droite de construction passant par deux points, tracée d'un bord à l'autre de l'écran. On s'y aimante sur toute sa longueur ; elle sert d'axe, de référence de cote ou de coupe pour Ajuster. Pas de longueur (pas de cote de longueur, pas d'ajuster / prolonger / congé sur elle). Une fenêtre ne la prend jamais entièrement ; une capture la prend si elle traverse le cadre.
- **Cadre de sélection dans les outils** Symétrie, Décaler, Congé / Chanfrein (et Déplacer, Copier, Pivoter) : activer le cadre ne quitte plus ces outils pendant le choix des éléments. Symétrie : le cadre ajoute ou retire des éléments. Décaler : plusieurs contours d'un coup (les contours fermés sont tous décalés du même côté, extérieur ou intérieur). Congé / chanfrein : tous les coins pris dans le cadre.
- **Colinéaire** entre deux lignes bout à bout : n'est plus vue à tort comme une sur-contrainte.
- **Congé et chanfrein** : le coin d'origine est gardé, relié aux nouvelles extrémités par deux lignes de construction colinéaires. Ce qui y était attaché (diagonale, cotes, relations) reste donc en place ; une cote de longueur d'une des lignes devient la cote jusqu'au coin. Une cote de rayon est ajoutée au congé, deux cotes (coin → bouts du chanfrein) au chanfrein.
- Aperçus de Symétrie, Décaler, Déplacer et Copier en jaune.
- Les icônes de relations ne se posent plus sur une entité, un point ou une autre icône.
- L'outil Miroir s'appelle maintenant **Symétrie**.

## Retours iPhone intégrés (0.3.3 – 0.3.5)

- Décaler : « Ajouter une cote » est active par défaut.
- Décaler : inverser la cote d'un décalage (⇅ au clavier) fait passer **tout le contour décalé** de l'autre côté de l'original, pas seulement la ligne cotée.
- **Cotation ordinale parallèle à une ligne** : si on touche une ligne inclinée comme référence (ou un point, puis une ligne), comme pour la cotation intelligente, l’endroit où glisse le doigt pour placer la cote 0 choisit des cotes horizontales (au-dessus / en dessous), verticales (à gauche / à droite) , parallèles à la ligne (à côté d’elle, ou dans les coins situés à côté d’elle ; distances mesurées le long de la ligne) ou perpendiculaires à la ligne (dans les coins situés dans son prolongement, au-delà de ses bouts).
- Bandeau d'infos : le type de l'élément sélectionné est indiqué (ligne, ligne de construction, ligne infinie, cercle, arc, point, centre, point d'esquisse, origine, type de cote) ; pour plusieurs éléments, le détail (« 2 lignes · 1 cercle »).

## Retours iPhone intégrés (0.3.6 – 0.3.7)

- Fenêtre Aimantation : l'interrupteur « Grille » n'est plus grisé quand la grille est masquée.
- **Bouton Affichage (œil)**, sous le bouton plein écran : un interrupteur par type d'élément (lignes, cercles, arcs, construction, points, cotes, relations, axes et origine), plus « Tout afficher » et « Tout masquer ». Un élément masqué n'est ni dessiné, ni sélectionnable, ni aimanté (ses relations agissent toujours). Seul le type coupé est masqué (0.3.7) : une ligne masquée garde ses points, ses cotes et ses relations à l'écran. L'œil est barré et en couleur tant que quelque chose est masqué. Réglage gardé.
- Bandeau d'infos sur plusieurs lignes : il grandit vers le haut par-dessus le dessin, les boutons du dessin remontent avec lui ; la zone de dessin ne bouge plus.
- Plusieurs éléments sélectionnés : la phrase « Choisissez une relation ci-dessus » est retirée.
- Aperçus des modifications (Symétrie, Décaler, Déplacer, Copier) en jaune #FFFF00 (0.3.7).

## Tester sur ordinateur

```sh
cd "CAO PWA"
python3 -m http.server 8080
```

Puis ouvrir http://localhost:8080. La molette zoome, la souris remplace le doigt.

## Tester sur iPhone (installation hors ligne)

L'app est publiée sur GitHub Pages : https://lumin0o.github.io/2D-CAT/ (dépôt Lumin0o/2D-CAT, branche main). Chaque `git push` met le site à jour ; l'app installée se met à jour à sa réouverture.

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
