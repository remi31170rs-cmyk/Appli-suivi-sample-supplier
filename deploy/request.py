#!/usr/bin/env python3
"""Client CI de déploiement ; ne journalise aucun jeton."""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


PUBLIC_ERRORS = {
    "configuration": "Configuration Docker invalide : demander à l’enseignant de vérifier la configuration serveur.",
    "registry_auth": "Connexion à GHCR refusée : vérifier les droits du package et le jeton temporaire du workflow.",
    "image_pull": "Téléchargement impossible : vérifier que le dépôt autorisé correspond au dépôt GitHub, que le digest existe et que le package est accessible.",
    "unhealthy": "L’application ne démarre pas ou /api/health échoue sur le port 3000. Faire vérifier les journaux serveur par l’enseignant.",
    "unhealthy_rollback": "L’application ne démarre pas ou /api/health échoue sur le port 3000. La version précédente a été rétablie ; faire vérifier les journaux serveur par l’enseignant.",
}


def request_deployment(url, token, digest, registry_token=""):
    address = urllib.parse.urlsplit(url)
    if (
        address.scheme != "https"
        or not address.hostname
        or address.username
        or address.password
        or address.query
        or address.fragment
        or not re.fullmatch(r"/__deploy/(suivi|p[0-9]{2})", address.path)
    ):
        raise ValueError("URL HTTPS de déploiement invalide.")
    if not token or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise ValueError("Jeton privé et digest SHA-256 requis.")

    body = {"digest": digest}
    if registry_token:
        if len(registry_token) > 2048 or any(
            ord(character) < 33 or ord(character) > 126
            for character in registry_token
        ):
            raise ValueError("Jeton de registre invalide.")
        body["registry_token"] = registry_token

    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
        },
    )

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None

    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=440) as response:
            result = json.load(response)
            if (
                response.status != 200
                or result.get("status") != "healthy"
                or result.get("digest") != digest
            ):
                raise ValueError("Version non saine.")
            return result
    except urllib.error.HTTPError as error:
        message = (
            f"Échec HTTP {error.code}. "
            "Consulter l’enseignant pour vérifier les journaux du serveur."
        )
        try:
            payload = json.loads(error.read(4096))
            code = payload.get("error_code") if isinstance(payload, dict) else None
            if isinstance(code, str):
                message = PUBLIC_ERRORS.get(code, message)
        except (ValueError, OSError):
            pass
        raise ValueError(message) from None


if __name__ == "__main__":
    try:
        result = request_deployment(
            os.environ.get("DEPLOY_URL", ""),
            os.environ.get("DEPLOY_TOKEN", ""),
            os.environ.get("DIGEST", ""),
            os.environ.get("REGISTRY_TOKEN", ""),
        )
        print("Déploiement vérifié : " + result["project"] + " @ " + result["digest"])
    except ValueError as error:
        print(
            "Déploiement refusé ou indisponible : " + str(error),
            file=sys.stderr,
        )
        sys.exit(1)
    except (OSError, urllib.error.URLError):
        print(
            "Déploiement refusé ou indisponible. Vérifier les paramètres privés et le résumé du workflow.",
            file=sys.stderr,
        )
        sys.exit(1)