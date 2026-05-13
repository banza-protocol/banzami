package observability

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	promexporter "go.opentelemetry.io/otel/exporters/prometheus"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// ShutdownFunc flushes and shuts down all OTel providers.
type ShutdownFunc func(context.Context) error

// Setup initialises the global OTel tracer and meter providers.
//
// Metrics are always active (Prometheus pull model — /metrics endpoint).
// Tracing is active only when otlpEndpoint is non-empty; otherwise spans
// are recorded to the no-op provider and produce zero overhead.
func Setup(ctx context.Context, serviceName, version, otlpEndpoint string) (ShutdownFunc, error) {
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion(version),
		),
		resource.WithHost(),
		resource.WithProcess(),
	)
	if err != nil {
		return nil, fmt.Errorf("otel resource: %w", err)
	}

	// Metrics — always active, scraped by Prometheus.
	promExp, err := promexporter.New()
	if err != nil {
		return nil, fmt.Errorf("prometheus exporter: %w", err)
	}
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(res),
		sdkmetric.WithReader(promExp),
	)
	otel.SetMeterProvider(mp)

	// Traces — only when an OTLP collector is configured.
	var tp *sdktrace.TracerProvider
	if otlpEndpoint != "" {
		exp, err := otlptracehttp.New(ctx,
			otlptracehttp.WithEndpoint(otlpEndpoint),
			otlptracehttp.WithInsecure(),
		)
		if err != nil {
			return nil, fmt.Errorf("otlp trace exporter: %w", err)
		}
		tp = sdktrace.NewTracerProvider(
			sdktrace.WithBatcher(exp, sdktrace.WithBatchTimeout(5*time.Second)),
			sdktrace.WithResource(res),
			sdktrace.WithSampler(sdktrace.AlwaysSample()),
		)
		otel.SetTracerProvider(tp)
	}

	// W3C TraceContext + Baggage propagation — always enabled so that
	// traceparent headers from upstream callers are honoured even in dev.
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return func(ctx context.Context) error {
		if tp != nil {
			if err := tp.Shutdown(ctx); err != nil {
				return err
			}
		}
		return mp.Shutdown(ctx)
	}, nil
}
