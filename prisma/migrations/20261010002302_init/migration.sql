-- CreateEnum
CREATE TYPE "Category" AS ENUM ('EKIDEN', 'MARATHON', 'TRACK');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "BroadcastInfoStatus" AS ENUM ('CONFIRMED', 'NOT_ANNOUNCED', 'UNVERIFIED', 'NO_BROADCAST', 'PAST_REFERENCE');

-- CreateEnum
CREATE TYPE "SlotVerificationStatus" AS ENUM ('CONFIRMED', 'UNVERIFIED', 'PAST_REFERENCE');

-- CreateEnum
CREATE TYPE "BroadcastMedium" AS ENUM ('TERRESTRIAL', 'BS', 'CS', 'INTERNET', 'RADIO');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('FREE', 'PAID', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ViewingType" AS ENUM ('LIVE', 'DELAYED', 'ON_DEMAND', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RegionAvailability" AS ENUM ('NATIONWIDE', 'REGIONAL', 'JAPAN_UNKNOWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('OFFICIAL_SITE', 'BROADCAST_INFO', 'OTHER');

-- CreateEnum
CREATE TYPE "CollectionRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "FetchMode" AS ENUM ('HTTP', 'FIXTURE');

-- CreateEnum
CREATE TYPE "ExtractionProviderKind" AS ENUM ('FIXTURE', 'RULE_BASED', 'LLM');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "officialUrl" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "editionLabel" TEXT,
    "seasonYear" INTEGER NOT NULL,
    "category" "Category" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "venueName" TEXT,
    "venueRegion" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'JP',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startAt" TIMESTAMPTZ(3),
    "officialUrl" TEXT,
    "broadcastInfoStatus" "BroadcastInfoStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "broadcastNote" TEXT,
    "broadcastCheckedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSession" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startAt" TIMESTAMPTZ(3),
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastSlot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "medium" "BroadcastMedium" NOT NULL,
    "providerName" TEXT NOT NULL,
    "airDate" DATE,
    "startAt" TIMESTAMPTZ(3),
    "endAt" TIMESTAMPTZ(3),
    "cost" "CostType" NOT NULL DEFAULT 'UNKNOWN',
    "viewingType" "ViewingType" NOT NULL DEFAULT 'UNKNOWN',
    "region" "RegionAvailability" NOT NULL DEFAULT 'UNKNOWN',
    "regionNote" TEXT,
    "note" TEXT,
    "watchUrl" TEXT,
    "infoUrl" TEXT,
    "verificationStatus" "SlotVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "verifiedAt" TIMESTAMPTZ(3),
    "sourceId" TEXT,
    "originCandidateId" TEXT,
    "originItemKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BroadcastSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "collectEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastFetchedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchMode" "FetchMode" NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerKind" "ExtractionProviderKind" NOT NULL,
    "status" "CollectionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "httpStatus" INTEGER,
    "finalUrl" TEXT,
    "contentType" TEXT,
    "byteLength" INTEGER,
    "contentHash" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionCandidate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sourceId" TEXT,
    "runId" TEXT,
    "fetchMode" "FetchMode" NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerKind" "ExtractionProviderKind" NOT NULL,
    "contentHash" TEXT,
    "payload" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExtractionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventSeries_slug_key" ON "EventSeries"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_status_endDate_idx" ON "Event"("status", "endDate");

-- CreateIndex
CREATE INDEX "Event_seriesId_idx" ON "Event"("seriesId");

-- CreateIndex
CREATE INDEX "EventSession_eventId_sortOrder_idx" ON "EventSession"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "BroadcastSlot_eventId_status_idx" ON "BroadcastSlot"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastSlot_originCandidateId_originItemKey_key" ON "BroadcastSlot"("originCandidateId", "originItemKey");

-- CreateIndex
CREATE UNIQUE INDEX "Source_eventId_url_key" ON "Source"("eventId", "url");

-- CreateIndex
CREATE INDEX "CollectionRun_sourceId_startedAt_idx" ON "CollectionRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "ExtractionCandidate_reviewStatus_createdAt_idx" ON "ExtractionCandidate"("reviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionCandidate_eventId_idx" ON "ExtractionCandidate"("eventId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastSlot" ADD CONSTRAINT "BroadcastSlot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastSlot" ADD CONSTRAINT "BroadcastSlot_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastSlot" ADD CONSTRAINT "BroadcastSlot_originCandidateId_fkey" FOREIGN KEY ("originCandidateId") REFERENCES "ExtractionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionCandidate" ADD CONSTRAINT "ExtractionCandidate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionCandidate" ADD CONSTRAINT "ExtractionCandidate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionCandidate" ADD CONSTRAINT "ExtractionCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
