import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { cache } from "react";
import { authOptions } from "@/lib/auth-options";
import { getTrip as loadTrip, isTripOwner } from "@/lib/db";
import { isValidTripId } from "@/lib/trip-id";
import { TripPageClient } from "./trip-page-client";

export const dynamic = "force-dynamic";

const getTrip = cache(loadTrip);

type Ctx = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { id } = await params;
  if (!isValidTripId(id)) {
    return { title: "山行ハブ", robots: { index: false, follow: false } };
  }
  const trip = await getTrip(id);
  if (!trip) {
    return { title: "見つかりません | 山行ハブ", robots: { index: false, follow: false } };
  }
  const title = trip.payload.title?.trim() || "山行ページ";
  return {
    title: `${title} | 山行ハブ`,
    robots: { index: false, follow: false },
  };
}

export default async function TripPage(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isValidTripId(id)) notFound();
  const trip = await getTrip(id);
  if (!trip) notFound();
  const session = await getServerSession(authOptions);
  const canManageRecruitment = session?.user?.id
    ? await isTripOwner(id, session.user.id)
    : false;
  return (
    <TripPageClient
      id={trip.id}
      initialPayload={trip.payload}
      initialUpdatedAt={trip.updated_at}
      canManageRecruitment={canManageRecruitment}
    />
  );
}
