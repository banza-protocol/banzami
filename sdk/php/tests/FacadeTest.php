<?php

declare(strict_types=1);

namespace Banzami\Tests;

use Banzami\BanzamiClient;
use PHPUnit\Framework\TestCase;

/**
 * The Laravel facade promises exactly what BanzamiClient has.
 *
 * Its docblock declared six payment-request methods removed from the client
 * with their routes (RA-057), and listRefunds with a $transactionId the client
 * no longer takes. An IDE, a static analyser and a developer all trust those
 * @method lines; a call through the facade then failed at runtime. Read from the
 * file itself — no Laravel needed.
 */
final class FacadeTest extends TestCase
{
    /** @return array<string, string> method name => parameter list as written */
    private function facadeMethods(): array
    {
        $src = file_get_contents(__DIR__ . '/../laravel/Facades/Banzami.php');
        self::assertIsString($src);
        preg_match_all('/@method\s+static\s+\S+\s+(\w+)\(([^)]*)\)/', $src, $m, PREG_SET_ORDER);
        $out = [];
        foreach ($m as [, $name, $params]) {
            $out[$name] = $params;
        }
        return $out;
    }

    public function testEveryFacadeMethodExistsOnTheClient(): void
    {
        $methods = $this->facadeMethods();
        self::assertNotEmpty($methods);
        $missing = array_values(array_filter(
            array_keys($methods),
            static fn (string $n): bool => !method_exists(BanzamiClient::class, $n),
        ));
        self::assertSame([], $missing, 'facade declares methods BanzamiClient does not have');
    }

    public function testFacadeParametersMatchTheClient(): void
    {
        foreach ($this->facadeMethods() as $name => $params) {
            $declared = array_values(array_filter(array_map(
                static fn (string $p): string => preg_replace('/\s*=.*$/', '', trim($p)) ?? '',
                $params === '' ? [] : explode(',', $params),
            )));
            $declaredNames = array_map(
                static fn (string $p): string => (string) preg_replace('/^.*\$/', '$', $p),
                $declared,
            );
            $actual = array_map(
                static fn (\ReflectionParameter $p): string => '$' . $p->getName(),
                (new \ReflectionMethod(BanzamiClient::class, $name))->getParameters(),
            );
            self::assertSame($actual, $declaredNames, "facade {$name}() parameters differ from BanzamiClient");
        }
    }

    public function testNoPaymentRequestMethods(): void
    {
        foreach (array_keys($this->facadeMethods()) as $name) {
            self::assertStringNotContainsString('PaymentRequest', $name);
        }
    }
}
