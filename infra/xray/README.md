# Xray Runtime Notes

- `infra/xray/templates/` contains starter templates for the first VLESS + REALITY profile.
- `infra/xray/generated/config.json` is a generated runtime artifact and is intentionally gitignored.
- Today it is rendered by `infra/scripts/render-xray-config.sh`.
- In the next backend phase, the API will become the authoritative renderer and write the same output format.
