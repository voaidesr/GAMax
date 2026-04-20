# GAMax

Genetic Algorithm Maximizer - a web app that evolves a population to find the maximum of a quadratic polynomial $f(x) = ax^2 + bx + c$ over a user-defined domain.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Haskell, Servant, Warp |
| Frontend | Vite, Plotly.js |
| Container | Docker, docker-compose |


## Run with Docker

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8080


## Run locally (development)

**Backend** requires [GHC 9.6](https://www.haskell.org/ghcup/) and `cabal`:

```bash
cd backend
cabal run backend
```

**Frontend** requires Node 20+:

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server: http://localhost:5173
API calls are automatically proxied to `localhost:8080` via Vite.


## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/init_config` | POST | Create a GA config from parameters |
| `/api/init_population` | POST | Generate the initial random population |
| `/api/next_generation` | POST | Step one generation forward |


## Usage

1. Set the polynomial coefficients **a**, **b**, **c** and the search domain **[x min, x max]**
2. Configure population size, generations, crossover/mutation probabilities, and a random seed
3. Click **Initialize**: the parabola and initial population appear on the chart
4. Step through generations with **Next Generation**, or skip to the end with **Fast Forward**
5. Open the **Evolution** panel to see fitness converge over generations
