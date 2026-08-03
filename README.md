

# Punah-पुस्तक

## About

Punah-पुस्तक is an online marketplace dedicated to buying and selling second-hand books at affordable prices, conveniently delivered to users' doorsteps. Our platform aims to bridge the gap between book enthusiasts looking for budget-friendly options and individuals seeking to declutter their bookshelves.

## Key Features

- **Buy Second-hand Books**: Browse through a diverse collection of second-hand books across various genres and subjects, ensuring quality reads at pocket-friendly prices.

- **Sell Your Books**: Easily list your preloved books for sale on our platform, connecting with potential buyers looking for great deals on used books.

- **Convenient Delivery**: Enjoy the convenience of doorstep delivery, making the book-buying experience hassle-free and accessible to users nationwide.

- **Environmentally Conscious**: By promoting the reuse and recycling of books, Punah-पुस्तक contributes to environmental sustainability by reducing paper waste and minimizing the carbon footprint associated with book production.

## How It Works

1. **Browse Listings**: Explore our catalog of second-hand books and find the titles that interest you.

2. **Place an Order**: Select the books you wish to purchase and proceed to checkout. 

3. **Sell Your Books**: If you have books to sell, list them on our platform by providing details and setting a price.

4. **Doorstep Delivery**: Sit back and relax as your purchased books are delivered right to your doorstep, ensuring a seamless and convenient shopping experience.

## Development Setup (V2)

The V2 rewrite (see `SRS-v2.1.0.md`) is a FastAPI backend (`backend/`) and a
React + TypeScript frontend (`frontend/`), containerized via
`docker-compose.yml`. This section is kept in sync with the current state
of that rewrite as milestones land; see `IMPLEMENTATION_SUMMARY.md` for the
full decision log behind it.

**Prerequisites**: Docker and Docker Compose.

```bash
docker compose up
```

This starts Postgres (`db`), MinIO object storage (`storage` +
`storage-init`), the API (`api`, on `http://localhost:8000`), and the
frontend dev server (`web`, on `http://localhost:5173`). On first run,
apply database migrations:

```bash
docker compose exec api alembic upgrade head
```

**Running tests locally**:

```bash
# Backend (from backend/, with a Python 3.12 virtualenv active)
pip install -e ".[dev]"
ruff check . && ruff format --check . && mypy app alembic tests
pytest

# Frontend (from frontend/)
npm ci
npx tsc --noEmit
npm run test
npm run build
```

## Contributing

We welcome contributions from the community to improve and enhance Punah-पुस्तक. If you have suggestions, bug reports, or would like to contribute code, please feel free to submit a pull request or open an issue on our GitHub repository.
##Link to website 
https://Sneha73685.github.io/Punah-Pustak
