# Pliki do katalogu `.github/`

Katalog `.github/` jest chroniony przed zapisem przez narzędzia zewnętrzne, dlatego
pliki są przygotowane tutaj. Przenieś je poleceniami (w katalogu repozytorium):

```bash
mv -f tools/github-workflows/ci.yml tools/github-workflows/deploy.yml \
      tools/github-workflows/snapshot.yml tools/github-workflows/healthcheck.yml .github/workflows/
mv -f tools/github-workflows/dependabot.yml .github/
git rm -r tools/github-workflows
git add .github
```
