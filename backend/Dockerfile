# PediTrack API. Built by Railway from this folder (root directory "backend"); see DEPLOY.md.

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Static binary: the runtime image has no C library.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# Distroless: just the binary and CA certificates (it calls Clerk and the push services over HTTPS).
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
USER nonroot
# The API listens on $PORT, which Railway sets.
ENTRYPOINT ["/api"]
