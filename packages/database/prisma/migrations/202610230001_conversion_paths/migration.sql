-- CreateTable
CREATE TABLE "ConversionPath" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "steps" JSONB NOT NULL,
    "windowMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConversionPath_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversionPath_projectId_name_key" ON "ConversionPath"("projectId", "name");

-- CreateIndex
CREATE INDEX "ConversionPath_projectId_createdAt_id_idx" ON "ConversionPath"("projectId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "ConversionPath" ADD CONSTRAINT "ConversionPath_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Support ordered project track-event scans used by conversion paths
CREATE INDEX "AnalyticsEvent_projectId_type_occurredAt_eventId_idx"
    ON "AnalyticsEvent"("projectId", "type", "occurredAt", "eventId");
