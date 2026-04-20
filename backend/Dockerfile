FROM haskell:9.6 AS builder

WORKDIR /build

COPY backend.cabal .
COPY LICENSE .

RUN touch CHANGELOG.md

RUN cabal update && cabal build --only-dependencies -j$(nproc)

COPY app/ app/
COPY src/ src/

RUN cabal build all -j$(nproc)

RUN mkdir -p /dist && \
    find /build/dist-newstyle -type f -name "backend" -executable \
        | head -1 \
        | xargs -I{} cp {} /dist/backend

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgmp10 libffi8 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /dist/backend .

EXPOSE 8080

CMD ["./backend"]
