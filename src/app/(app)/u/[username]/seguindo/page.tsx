import type { Metadata } from "next";
import { FollowList } from "../_components/follow-list";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Seguindo de @${decodeURIComponent((await params).username)}` };
}

export default async function Page({ params }: Props) {
  return <FollowList username={(await params).username} kind="seguindo" />;
}
