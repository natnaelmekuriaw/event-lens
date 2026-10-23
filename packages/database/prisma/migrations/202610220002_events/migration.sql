-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('pending', 'processed', 'failed', 'expired');

-- CreateTable
CREATE TABLE "EventReceipt" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "payload" JSONB,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'pending',
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "errorCode" VARCHAR(40),

    CONSTRAINT "EventReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOutbox" (
    "receiptId" UUID NOT NULL,
    "nextDispatchAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("receiptId")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "anonymousId" VARCHAR(200) NOT NULL,
    "userId" VARCHAR(200),
    "properties" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "identityConflict" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityLink" (
    "projectId" UUID NOT NULL,
    "anonymousId" VARCHAR(200) NOT NULL,
    "userId" VARCHAR(200) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityLink_pkey" PRIMARY KEY ("projectId","anonymousId")
);

-- CreateIndex
CREATE INDEX "EventReceipt_projectId_status_id_idx" ON "EventReceipt"("projectId", "status", "id");

-- CreateIndex
CREATE INDEX "EventReceipt_status_failedAt_idx" ON "EventReceipt"("status", "failedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventReceipt_projectId_eventId_key" ON "EventReceipt"("projectId", "eventId");

-- CreateIndex
CREATE INDEX "EventOutbox_nextDispatchAt_idx" ON "EventOutbox"("nextDispatchAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_projectId_occurredAt_id_idx" ON "AnalyticsEvent"("projectId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_projectId_name_occurredAt_id_idx" ON "AnalyticsEvent"("projectId", "name", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_projectId_anonymousId_occurredAt_idx" ON "AnalyticsEvent"("projectId", "anonymousId", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_projectId_userId_occurredAt_idx" ON "AnalyticsEvent"("projectId", "userId", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_receivedAt_idx" ON "AnalyticsEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_projectId_eventId_key" ON "AnalyticsEvent"("projectId", "eventId");

-- CreateIndex
CREATE INDEX "IdentityLink_projectId_userId_idx" ON "IdentityLink"("projectId", "userId");

-- CreateIndex
CREATE INDEX "IdentityLink_updatedAt_idx" ON "IdentityLink"("updatedAt");

-- AddForeignKey
ALTER TABLE "EventReceipt" ADD CONSTRAINT "EventReceipt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOutbox" ADD CONSTRAINT "EventOutbox_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "EventReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityLink" ADD CONSTRAINT "IdentityLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
