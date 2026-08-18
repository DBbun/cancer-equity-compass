# Deployment and publication

## GitHub Pages

The repository is a static site: `index.html`, `styles.css`, ES modules under
`js/`, and versioned schemas under `data/`. It can be hosted directly from the
repository root using GitHub Pages. Run `npm test` before publishing.

The proposed public repository name is `DBbun/cancer-equity-compass`. Update the
placeholder repository URL in `CITATION.cff` if a different name is selected.

## Hugging Face Spaces

The same static assets can be mirrored in a Static HTML Space. A public Space
must contain only synthetic examples. The canonical schema and model card should
remain versioned with the application.

## Controlled data

GitHub Pages and a public Hugging Face Space are demonstration surfaces, not
controlled-data environments. The public tool can show its synthetic workflow;
approved CCDI or dbGaP data should be analyzed only within an authorized
environment that meets the governing data-use and security requirements.

