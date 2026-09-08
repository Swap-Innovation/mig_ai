from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import User, get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
settings = get_settings()

DEMO_USERS = [
    {
        "email": "architect@demo.local",
        "name": "Alex Architect",
        "role": "architect",
        "password": "demo",
    },
    {
        "email": "owner@demo.local",
        "name": "Pat Product Owner",
        "role": "product_owner",
        "password": "demo",
    },
    {
        "email": "dataowner@demo.local",
        "name": "Dana Data Owner",
        "role": "data_owner",
        "password": "demo",
    },
    {
        "email": "steward@demo.local",
        "name": "Sam Data Steward",
        "role": "data_steward",
        "password": "demo",
    },
    {
        "email": "board@demo.local",
        "name": "Casey Change Board",
        "role": "change_board",
        "password": "demo",
    },
    {
        "email": "engineer@demo.local",
        "name": "Jordan Engineer",
        "role": "engineer",
        "password": "demo",
    },
    {
        "email": "viewer@demo.local",
        "name": "Riley Viewer",
        "role": "viewer",
        "password": "demo",
    },
]


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    # jose expects exp as a numeric UTC timestamp
    payload = {
        "sub": subject,
        "role": role,
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        email: Optional[str] = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user


def require_roles(*roles: str):
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles and user.role != "change_board":
            # change_board can do most governance; still block viewer writes elsewhere
            if user.role == "viewer":
                raise HTTPException(status_code=403, detail="Insufficient role")
            if roles and user.role not in roles:
                raise HTTPException(status_code=403, detail=f"Requires one of: {roles}")
        return user

    return _dep
