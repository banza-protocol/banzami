<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

class AmountConversionTest extends TestCase
{
    private function toMinor(float $total, string $currency): int
    {
        $gateway = new class extends WC_Banzami_Gateway {
            public function init_form_fields(): void {}
            public function callToMinor(float $total, string $currency): int
            {
                return $this->to_minor_units_public($total, $currency);
            }
        };

        $method = new ReflectionMethod(WC_Banzami_Gateway::class, 'to_minor_units');
        $method->setAccessible(true);
        return $method->invoke($gateway, $total, $currency);
    }

    public function test_aoa_is_integer_kwanzas(): void
    {
        $this->assertSame(1000, $this->toMinor(1000.0, 'AOA'));
        $this->assertSame(50,   $this->toMinor(50.0, 'AOA'));
    }

    public function test_aoa_rounds_fractional(): void
    {
        $this->assertSame(100, $this->toMinor(99.6, 'AOA'));
        $this->assertSame(99,  $this->toMinor(99.4, 'AOA'));
    }

    public function test_usd_multiplies_by_100(): void
    {
        $this->assertSame(5000, $this->toMinor(50.0, 'USD'));
        $this->assertSame(1,    $this->toMinor(0.01, 'USD'));
    }

    public function test_currency_comparison_is_case_insensitive(): void
    {
        $this->assertSame(500, $this->toMinor(500.0, 'aoa'));
        $this->assertSame(500, $this->toMinor(500.0, 'Aoa'));
    }
}
