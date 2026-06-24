import { redirect } from 'next/navigation';

interface Props {
  params: { slug: string };
}

/**
 * Backward-compat redirect: the bare /<slug> payment URL is deprecated.
 * The canonical payment link is /pay/<slug> (what the SDK now emits and the
 * mobile app deep-links). A 308 keeps old links working without making the
 * bare path canonical.
 */
export default function BareSlugRedirect({ params }: Props) {
  redirect(`/pay/${params.slug}`);
}
