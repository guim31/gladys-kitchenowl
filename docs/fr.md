# KitchenOwl

Retrouvez dans Gladys les listes de courses et le planning des repas de votre
[KitchenOwl](https://kitchenowl.org) : combien d'articles restent à acheter,
ce qui est prévu au menu aujourd'hui et demain. Ajoutez un article depuis le
tableau de bord ou une scène (« il n'y a plus de lait »), cochez-en un d'un
geste, et laissez une scène réagir quand quelqu'un ajoute quelque chose à la
liste.

> **Vos retours sont les bienvenus.** Cette intégration a été testée contre
> un vrai serveur KitchenOwl (image Docker `tombursch/kitchenowl`, octobre
> 2026), pas encore au quotidien avec un vrai Gladys. Si quelque chose ne
> marche pas comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-kitchenowl/issues).

## Ce qu'il faut

- Gladys Assistant 5.2.0 ou plus récent (les formulaires des boutons de
  widget).
- Un **KitchenOwl auto-hébergé**, joignable depuis Gladys (l'image Docker
  écoute sur le port 8080).
- Un **jeton longue durée** d'un utilisateur KitchenOwl. Dans KitchenOwl :
  votre **profil** → **Sessions** → **Jetons longue durée** → ajoutez-en un,
  nommez-le `Gladys`, et copiez le jeton : KitchenOwl ne l'affiche qu'une
  fois.

L'intégration voit les foyers de cet utilisateur, et ajoute ou coche les
articles **en son nom**. Le service hébergé `app.kitchenowl.org` propose la
même API, mais n'a pas été testé.

## Mise en place

1. Dans Gladys, **Intégrations** → installez **KitchenOwl**.
2. Dans **Configuration**, saisissez l'**adresse** de KitchenOwl
   (`http://192.168.1.20:8080`, `https://owl.example.org`… ; l'adresse
   copiée depuis le navigateur fonctionne aussi) et le **jeton longue
   durée**.
3. Options :
   - **Accepter les certificats auto-signés** : seulement pour une adresse en
     `https://` dont le certificat est auto-signé, sur votre propre serveur.
   - **Intervalle de rafraîchissement** : fréquence de lecture de KitchenOwl,
     de 30 secondes à 5 minutes (1 minute par défaut). Minuit est toujours
     suivi à l'heure.
   - **Langue des noms de fonctionnalités** : les noms donnés aux
     fonctionnalités à l'ajout d'un appareil, et les textes envoyés aux
     scènes (français par défaut).
4. Enregistrez, puis cliquez sur **Tester la connexion** : elle indique les
   foyers, les listes et le nombre d'articles à acheter.
5. Ouvrez l'onglet **Découverte** et ajoutez les appareils voulus.

## Appareils

**Un appareil par liste de courses** (`KitchenOwl Default`, `KitchenOwl
Bricolage`…), avec une fonctionnalité :

| Fonctionnalité     | Valeur                             |
| ------------------ | ---------------------------------- |
| Articles à acheter | le nombre d'articles sur la liste. |

**Un appareil par foyer** (`KitchenOwl <foyer>`), pour le planning des
repas :

| Fonctionnalité  | Valeur                                                                        |
| --------------- | ----------------------------------------------------------------------------- |
| Repas du jour   | les recettes prévues aujourd'hui, séparées par des virgules, ou Rien de prévu |
| Repas de demain | la même chose pour demain                                                     |

« Aujourd'hui » est le jour dans le fuseau horaire de Gladys. Les recettes
prévues sans jour (« un jour ») ne sont pas affichées. Avec plusieurs foyers,
les appareils de liste portent aussi le nom du foyer.

Les valeurs ne sont envoyées que quand elles changent (et toutes les 12
heures sinon). Le badge de l'appareil indique **Injoignable** quand
KitchenOwl ne répond pas.

## Tableau de bord

Le widget **Liste de courses** affiche une liste : le nombre d'articles, les
articles avec leur description (neuf, puis une ligne « Autres articles »),
et quatre boutons :

- **Ajouter** ouvre un formulaire (article, description) : l'article est mis
  sur la liste, jamais en double.
- **Cocher** ouvre un formulaire qui liste les articles : celui choisi est
  coché.
- Les deux premiers articles ont leur propre bouton, pour les cocher d'un
  geste.

Dans les réglages du widget, choisissez un appareil de liste, ou un appareil
de foyer pour sa liste par défaut. Vide : la liste par défaut du premier
foyer. Le widget fonctionne avant même qu'un appareil soit ajouté à Gladys.

## Scènes

### Déclencheurs

**Article ajouté à une liste KitchenOwl** : un article a été mis sur une
liste de courses, dans KitchenOwl ou depuis Gladys. Les articles déjà sur les
listes au démarrage de l'intégration ne comptent pas, et l'intégration se
souvient de ce qu'elle a vu d'un redémarrage à l'autre (un article ajouté
pendant qu'elle était arrêtée déclenche au démarrage suivant). Un article
coché puis remis compte à nouveau. Vingt événements au plus par liste et par
lecture (une recette qui ajoute trente ingrédients).

- Filtres : **Liste de courses** (un appareil de liste ; un appareil de
  foyer ne correspond jamais ; vide : toutes), **Nom de l'article** (nom
  exact, vide : tous).
- Variables : `item` (article), `description`, `list_name` (liste),
  `added_by` (le nom KitchenOwl du membre) et `from_gladys` (vrai quand
  l'article a été ajouté par une scène ou le widget : permet à une scène
  d'ignorer ses propres ajouts).

### Actions

**Ajouter à une liste KitchenOwl** : met un article sur une liste. Champs :
**Article** (obligatoire), **Description** (une quantité, facultative),
**Liste de courses** (un appareil de liste, ou un appareil de foyer pour sa
liste par défaut ; vide : la liste par défaut du premier foyer). Un article
déjà sur la liste (majuscules et accents ignorés) n'est pas ajouté deux
fois : sa description est remplacée par la nouvelle, si elle est donnée.
Sorties : `item`, `list_name`, `already_on_list`.

**Cocher un article KitchenOwl** : coche un article d'une liste, par son nom
(majuscules et accents ignorés). Absent de la liste : rien ne se passe, et la
sortie `removed` vaut faux. Sorties : `item`, `list_name`, `removed`.

Les champs acceptent les variables de scène (`{{triggerEvent.data.item}}`…).

### Idées de scènes

- Un bouton près de la machine à café → **Ajouter à une liste KitchenOwl**,
  article `Café` : la dernière capsule n'est plus jamais oubliée.
- **Article ajouté à une liste KitchenOwl**, liste `Bricolage` → un message à
  celui qui passe au magasin de bricolage : « {{triggerEvent.data.item}}
  ajouté par {{triggerEvent.data.added_by}} ».
- Tous les jours à 17 h → lire **Repas du jour** sur l'appareil du foyer et
  l'envoyer : le dîner est connu avant de quitter le travail.
- **Articles à acheter** au-dessus de 15 → un rappel qu'il est temps de faire
  les courses.

## Dépannage

- **« jeton refusé »** : le jeton longue durée a été révoqué ou mal recopié.
  Créez-en un nouveau dans KitchenOwl et collez-le à nouveau (un préfixe
  « Bearer » collé avec est retiré).
- **« aucune API KitchenOwl à cette adresse »** : quelque chose répond, mais
  pas KitchenOwl. Vérifiez le port (8080 pour l'image Docker) et, derrière un
  proxy inverse, le préfixe de chemin.
- **« KitchenOwl ne répond pas »** : mauvaise adresse, KitchenOwl arrêté, ou
  un pare-feu entre Gladys et KitchenOwl.
- **« certificat refusé »** : cochez **Accepter les certificats auto-signés**.
- **« L'utilisateur du jeton n'appartient à aucun foyer KitchenOwl »** :
  créez un foyer dans KitchenOwl, ou utilisez le jeton d'un membre.
- **Une nouvelle liste n'apparaît pas** : cliquez sur **Rechercher** dans
  l'onglet Découverte, ou attendez la lecture suivante.
- Les détails sont dans les logs de l'intégration (`LOG_LEVEL=debug` pour
  chaque lecture).

## Limites

- L'intégration lit KitchenOwl à intervalle régulier (30 s à 5 min) : un
  article ajouté dans KitchenOwl arrive dans Gladys dans ce délai. Elle
  n'utilise pas le canal temps réel de KitchenOwl.
- Le planning des repas est lu, pas modifié ; les dépenses et les recettes ne
  sont pas utilisées.
- La liste d'un formulaire du widget propose les 50 premiers articles.
- Les noms des fonctionnalités sont donnés à l'ajout d'un appareil : changer
  la langue ensuite ne les renomme pas.
- Testée contre un vrai serveur KitchenOwl en Docker, pas encore avec un vrai
  Gladys : vos retours sont les bienvenus.
