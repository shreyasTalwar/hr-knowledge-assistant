import os
import jwt

import requests
from functools import wraps
from flask import request, jsonify
from jwt.algorithms import RSAAlgorithm

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")

# Cache public keys to prevent hitting Clerk servers on every single API call
jwks_cache = None

def get_public_key(kid):
    global jwks_cache
    if not CLERK_JWKS_URL:
        raise ValueError("CLERK_JWKS_URL environment variable is missing")

    if not jwks_cache:
        try:
            response = requests.get(CLERK_JWKS_URL)
            response.raise_for_status()
            jwks_cache = response.json()
        except Exception as e:
            print(f"Error fetching JWKS from Clerk: {e}")
            return None

    # Find the matching key in JWKS
    for key_data in jwks_cache.get("keys", []):
        if key_data.get("kid") == kid:
            return RSAAlgorithm.from_jwk(key_data)
    
    return None

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
                # In Clerk, standard custom roles are stored inside publicMetadata -> public_metadata
                payload = jwt.decode(
                    token, 
                    public_key, 
                    algorithms=["RS256"], 
                    options={"verify_exp": True}
                )

                # Log token payload details for diagnostics
                print("Token Payload Keys:", payload.keys())
                
                # Clerk's public metadata is loaded inside the token claims
                # It is often key-mapped as 'public_metadata' or nested under 'publicMetadata' or 'metadata'
                public_metadata = (
                    payload.get("public_metadata", {}) or 
                    payload.get("publicMetadata", {}) or 
                    payload.get("metadata", {})
                )
                
                print("Extracted Public Metadata:", public_metadata)
                
                user_role = public_metadata.get("role", "employee")
                
                # Development Bypass: Force admin role for your testing user account
                if payload.get("sub") == "user_3HdlXzuKasrniTJpJcTYHZ4wcS6":
                    user_role = "admin"
                    print(f"Dev Bypass: Forcing Admin role for User ID: {payload.get('sub')}")

                print(f"User ID: {payload.get('sub')}, Final Role: {user_role}")
                
                request.user = {
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
                return jsonify({"error": f"Internal authentication error: {str(e)}"}), 500

            return f(*args, **kwargs)
        return decorated

    return decorator
