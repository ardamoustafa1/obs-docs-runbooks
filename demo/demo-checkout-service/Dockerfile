# Build context must be the workspace root that holds both
# obs-instrumentation-sdk/ and obs-docs-runbooks/ as sibling directories
# (this demo depends on the SDK's go/ module via a local replace
# directive in go.mod). Run from that root:
#
#   docker build \
#     -f obs-docs-runbooks/demo/demo-checkout-service/Dockerfile \
#     -t demo-checkout-service:gameday .
FROM golang:1.25 AS builder
WORKDIR /workspace
# Preserve the same relative nesting as the real repo checkout
# (obs-docs-runbooks/demo/demo-checkout-service is 3 levels below the
# workspace root, obs-instrumentation-sdk/go is 2) so go.mod's
# `replace ... => ../../../obs-instrumentation-sdk/go` resolves correctly
# unmodified.
COPY obs-instrumentation-sdk/go ./obs-instrumentation-sdk/go
COPY obs-docs-runbooks/demo/demo-checkout-service ./obs-docs-runbooks/demo/demo-checkout-service
WORKDIR /workspace/obs-docs-runbooks/demo/demo-checkout-service
RUN go mod download
RUN CGO_ENABLED=0 go build -o /out/demo-checkout-service .

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /out/demo-checkout-service /demo-checkout-service
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/demo-checkout-service"]
