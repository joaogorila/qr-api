-- CreateEnum
CREATE TYPE "QrApiInboundMode" AS ENUM ('OFF', 'FOLLOWFY', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "QrApiInstanceStatus" AS ENUM ('PROVISIONING', 'QR_PENDING', 'CONNECTED', 'DEGRADED', 'DISCONNECTED', 'BANNED');

-- CreateEnum
CREATE TYPE "QrApiKeyMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "QrApiMessageStatus" AS ENUM ('QUEUED', 'SCHEDULED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "qr_api_instances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "evolutionInstanceId" TEXT,
    "inboundMode" "QrApiInboundMode" NOT NULL DEFAULT 'OFF',
    "status" "QrApiInstanceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "healthScore" INTEGER NOT NULL DEFAULT 100,
    "warmupUntil" TIMESTAMP(3),
    "dailyLimit" INTEGER NOT NULL DEFAULT 1000,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_api_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "mode" "QrApiKeyMode" NOT NULL DEFAULT 'LIVE',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_api_idempotency_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_api_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_api_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "externalId" TEXT,
    "to" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "QrApiMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "evolutionId" TEXT,
    "error" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_api_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_api_webhooks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY['*']::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_api_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_api_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "nextRetryAt" TIMESTAMP(3),
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "qr_api_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_api_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_api_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_api_users" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_api_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_api_subscriptions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_api_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_api_invoices" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'brl',
    "status" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "hostedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_api_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_api_usage_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "messagesFailed" INTEGER NOT NULL DEFAULT 0,
    "webhooksDelivered" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "qr_api_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qr_api_instances_evolutionInstanceId_key" ON "qr_api_instances"("evolutionInstanceId");

-- CreateIndex
CREATE INDEX "qr_api_instances_tenantId_revokedAt_idx" ON "qr_api_instances"("tenantId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "qr_api_keys_keyHash_key" ON "qr_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "qr_api_keys_tenantId_revokedAt_idx" ON "qr_api_keys"("tenantId", "revokedAt");

-- CreateIndex
CREATE INDEX "qr_api_idempotency_keys_expiresAt_idx" ON "qr_api_idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "qr_api_idempotency_keys_instanceId_key_key" ON "qr_api_idempotency_keys"("instanceId", "key");

-- CreateIndex
CREATE INDEX "qr_api_messages_instanceId_status_idx" ON "qr_api_messages"("instanceId", "status");

-- CreateIndex
CREATE INDEX "qr_api_messages_tenantId_createdAt_idx" ON "qr_api_messages"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "qr_api_webhooks_instanceId_active_idx" ON "qr_api_webhooks"("instanceId", "active");

-- CreateIndex
CREATE INDEX "qr_api_webhook_deliveries_status_nextRetryAt_idx" ON "qr_api_webhook_deliveries"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "qr_api_webhook_deliveries_webhookId_createdAt_idx" ON "qr_api_webhook_deliveries"("webhookId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "qr_api_accounts_stripeCustomerId_key" ON "qr_api_accounts"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_api_users_email_key" ON "qr_api_users"("email");

-- CreateIndex
CREATE INDEX "qr_api_users_accountId_idx" ON "qr_api_users"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_api_subscriptions_accountId_key" ON "qr_api_subscriptions"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_api_subscriptions_stripeSubscriptionId_key" ON "qr_api_subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_api_invoices_stripeInvoiceId_key" ON "qr_api_invoices"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "qr_api_invoices_accountId_createdAt_idx" ON "qr_api_invoices"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "qr_api_usage_records_instanceId_date_key" ON "qr_api_usage_records"("instanceId", "date");

-- AddForeignKey
ALTER TABLE "qr_api_messages" ADD CONSTRAINT "qr_api_messages_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "qr_api_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_api_webhooks" ADD CONSTRAINT "qr_api_webhooks_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "qr_api_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_api_webhook_deliveries" ADD CONSTRAINT "qr_api_webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "qr_api_webhooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_api_users" ADD CONSTRAINT "qr_api_users_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "qr_api_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_api_subscriptions" ADD CONSTRAINT "qr_api_subscriptions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "qr_api_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_api_invoices" ADD CONSTRAINT "qr_api_invoices_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "qr_api_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_api_usage_records" ADD CONSTRAINT "qr_api_usage_records_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "qr_api_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

