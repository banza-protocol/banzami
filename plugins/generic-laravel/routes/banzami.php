<?php

use Banzami\Laravel\Http\WebhookController;
use Illuminate\Support\Facades\Route;

Route::post('/banzami/webhook', [WebhookController::class, 'handle'])
    ->name('banzami.webhook');
