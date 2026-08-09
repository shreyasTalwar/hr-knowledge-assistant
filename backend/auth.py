import os
import jwt
import requests
from functools import wraps
from flask import request, jsonify, g
from jwt.algorithms import RSAAlgorithm

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")

# Cache public keys to prevent hitting Clerk servers on every single API call
jwks_cache = None

def fetch_jwks():
    if not CLERK_JWKS_URL:
        raise ValueError("CLERK_JWKS_URL environment variable is missing")
    response = requests.get(CLERK_JWKS_URL, timeout=5)
    response.raise_for_status()
    return response.json()

def get_public_key(kid):
    global jwks_cache

    if not CLERK_JWKS_URL:
        raise ValueError("CLERK_JWKS_URL environment variable is missing")

    if jwks_cache is None:
        try:
            jwks_cache = fetch_jwks()
        except Exception as e:
            print(f"Error fetching JWKS from Clerk: {e}")
            return None

    matching_key = next(
        (key for key in jwks_cache.get("keys", []) if key.get("kid") == kid),
        None
    )

    # Refresh once in case Clerk rotated its signing key
    if matching_key is None:
        try:
            jwks_cache = fetch_jwks()
            matching_key = next(
                (key for key in jwks_cache.get("keys", []) if key.get("kid") == kid),
                None
            )
        except Exception as e:
            print(f"Error refreshing JWKS from Clerk: {e}")
            return None

    return RSAAlgorithm.from_jwk(matching_key) if matching_key else None

def require_auth(required_role=None):
    """
    Decorator to protect Flask endpoints using Clerk JWT.
    Enforces authorization and role permissions.
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            auth_header = request.headers.get("Authorization", None)
            if not auth_header:
                return jsonify({"error": "Authorization header is missing"}), 401
            
            parts = auth_header.split()
            if parts[0].lower() != "bearer":
                return jsonify({"error": "Authorization header must start with Bearer"}), 401
            elif len(parts) == 1:
                return jsonify({"error": "Token not found"}), 401
            elif len(parts) > 2:
                return jsonify({"error": "Authorization header must be Bearer token"}), 401

            token = parts[1]

            try:
                # Retrieve unverified header to match kid
                unverified_header = jwt.get_unverified_header(token)
                kid = unverified_header.get("kid")
                if not kid:
                    return jsonify({"error": "Invalid token header structure"}), 401

                public_key = get_public_key(kid)
                if not public_key:
                    return jsonify({"error": "Could not find matching verification key"}), 401

                # Decode and verify token signature
                payload = jwt.decode(
                    token, 
                    public_key, 
                    algorithms=["RS256"], 
                    issuer=os.getenv("CLERK_ISSUER"),
                    options={
                        "verify_exp": True,
                        "verify_nbf": True,
                        "verify_iss": True,
                        "verify_aud": False
                    }
                )

                # Validate Authorized Party if configured
                authorized_party = os.getenv("CLERK_AUTHORIZED_PARTY")
                if authorized_party and payload.get("azp") != authorized_party:
                    return jsonify({"error": "Invalid authorized party"}), 401

                # Read role claim directly (fallback to employee)
                # User configures Clerk Custom claims to place: {"role": "{{user.public_metadata.role}}"}
                user_role = payload.get("role") or payload.get("public_metadata", {}).get("role", "employee")

                # Store auth context in Flask request context global g
                g.user = {
                    "id": payload.get("sub"),
                    "role": user_role
                }

                # Enforce required role permission levels
                if required_role and user_role != required_role:
                    print(f"Auth Block: User role '{user_role}' does not match required role '{required_role}'")
                    return jsonify({"error": "Forbidden: insufficient permissions"}), 403

            except jwt.ExpiredSignatureError:
                return jsonify({"error": "Token has expired"}), 401
            except jwt.InvalidTokenError as e:
                return jsonify({"error": f"Invalid token: {str(e)}"}), 401
            except Exception as e:
                print(f"Authentication error: {e}")
                return jsonify({"error": "Internal authentication error"}), 500

            return f(*args, **kwargs)
        return decorated
    return decorator
