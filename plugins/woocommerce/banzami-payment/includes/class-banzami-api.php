<?php
defined( 'ABSPATH' ) || exit;

/**
 * HTTP client for the Banzami API gateway.
 *
 * Uses wp_remote_post / wp_remote_get so WordPress proxy settings and
 * SSL verification flags are respected automatically.
 */
class Banzami_API {

    private string $base_url;
    private string $api_key;

    public function __construct( string $gateway_url, string $api_key ) {
        $this->base_url = rtrim( $gateway_url, '/' );
        $this->api_key  = $api_key;
    }

    // -------------------------------------------------------------------------
    // Transactions
    // -------------------------------------------------------------------------

    /**
     * Create a new payment transaction.
     *
     * @param array{amount_minor: int, currency: string, reference: string, description?: string, consumer_id?: string} $data
     * @return array|WP_Error
     */
    public function create_transaction( array $data ) {
        return $this->post( '/v1/transactions', $data );
    }

    /**
     * Retrieve a transaction by ID.
     *
     * @return array|WP_Error
     */
    public function get_transaction( string $id ) {
        return $this->get( '/v1/transactions/' . rawurlencode( $id ) );
    }

    // -------------------------------------------------------------------------
    // HTTP helpers
    // -------------------------------------------------------------------------

    /** @return array|WP_Error */
    private function post( string $path, array $body ) {
        $response = wp_remote_post(
            $this->base_url . $path,
            [
                'timeout' => 30,
                'headers' => $this->headers(),
                'body'    => wp_json_encode( $body ),
            ]
        );
        return $this->parse( $response );
    }

    /** @return array|WP_Error */
    private function get( string $path ) {
        $response = wp_remote_get(
            $this->base_url . $path,
            [
                'timeout' => 30,
                'headers' => $this->headers(),
            ]
        );
        return $this->parse( $response );
    }

    /** @return array<string, string> */
    private function headers(): array {
        return [
            'Authorization' => 'Bearer ' . $this->api_key,
            'Content-Type'  => 'application/json',
            'Accept'        => 'application/json',
        ];
    }

    /**
     * Parse a wp_remote_* response.
     *
     * Returns the decoded JSON body on success, or WP_Error on network/HTTP failure.
     *
     * @param array|WP_Error $response
     * @return array|WP_Error
     */
    private function parse( $response ) {
        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code( $response );
        $body = wp_remote_retrieve_body( $response );
        $data = json_decode( $body, true );

        if ( $code >= 400 ) {
            $message = isset( $data['message'] ) ? $data['message'] : "HTTP $code";
            $api_code = isset( $data['code'] ) ? $data['code'] : 'API_ERROR';
            return new WP_Error( $api_code, $message, [ 'status' => $code ] );
        }

        return is_array( $data ) ? $data : [];
    }
}
