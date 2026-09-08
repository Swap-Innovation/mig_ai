"""Background worker stub — agents run in-process for MVP; worker keeps process alive for Compose."""
import time

from app.db import init_db


def main() -> None:
    init_db()
    print("Migration worker ready (in-process agents via API). Waiting...")
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
