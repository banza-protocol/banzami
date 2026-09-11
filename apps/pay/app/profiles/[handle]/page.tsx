import { notFound } from 'next/navigation';
import { schemeFor } from '@/lib/deep-link';
import { serverEnvironment } from '@/lib/server-environment';
import { getMerchantProfile } from '@/lib/api';
import type { Metadata } from 'next';
import ProfilePayCard from './profile-pay-card';

interface Props {
  // Next 15: route params arrive as a Promise.
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getMerchantProfile(handle).catch(() => null);
  if (!profile) return { title: 'Perfil não encontrado — Banzami' };
  return {
    title: `${profile.display_name} (@${profile.handle}) — Banzami`,
    description: profile.tagline ?? profile.description ?? undefined,
  };
}

export default async function MerchantProfilePage({ params }: Props) {
  const { handle } = await params;
  const profile = await getMerchantProfile(handle);
  if (!profile || !profile.public) notFound();

  return (
    <main className="min-h-screen bg-off-white">
      {/* Cover */}
      <div
        className="w-full h-40 bg-gradient-to-br from-banzami to-banzami/70"
        style={profile.cover_url ? { backgroundImage: `url(${profile.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      />

      <div className="max-w-2xl mx-auto px-4 pb-12">
        {/* Avatar + identity */}
        <div className="flex items-end gap-4 -mt-10 mb-6">
          <div className="h-20 w-20 rounded-2xl border-4 border-white bg-banzami/10 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt={profile.display_name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-banzami select-none">
                {profile.display_name[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="pb-1">
            <h1 className="text-xl font-bold text-gray-900">{profile.display_name}</h1>
            <p className="text-sm text-gray-400">@{profile.handle}</p>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {/* Tagline / description */}
          {(profile.tagline || profile.description) && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              {profile.tagline && (
                <p className="text-base font-medium text-gray-800">{profile.tagline}</p>
              )}
              {profile.description && (
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{profile.description}</p>
              )}
            </div>
          )}

          {/* Category */}
          {profile.category && (
            <div className="flex items-center gap-2">
              <span className="bg-banzami/10 text-banzami text-xs font-semibold px-3 py-1 rounded-full">
                {profile.category}
              </span>
            </div>
          )}

          {/* Static QR + pay + share */}
          <ProfilePayCard handle={profile.handle} displayName={profile.display_name} appScheme={schemeFor(serverEnvironment())} />

          {/* Social links */}
          {profile.social_links.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Links</p>
              <ul className="flex flex-col gap-2">
                {profile.social_links.map(link => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                    >
                      <span className="font-medium capitalize">{link.platform}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-500 truncate">{link.url.replace(/^https?:\/\//, '')}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Banzami attribution */}
          <p className="text-center text-xs text-gray-300 pt-2">
            Pagamentos via <span className="font-semibold text-banzami">Banzami</span>
          </p>
        </div>
      </div>
    </main>
  );
}

