import { notFound } from 'next/navigation';
import { getMerchantProfile, type MerchantProfile } from '@/lib/api';
import type { Metadata } from 'next';

interface Props {
  params: { handle: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getMerchantProfile(params.handle).catch(() => null);
  if (!profile) return { title: 'Perfil não encontrado — Banzami' };
  return {
    title: `${profile.display_name} (@${profile.handle}) — Banzami`,
    description: profile.tagline ?? profile.description ?? undefined,
  };
}

export default async function MerchantProfilePage({ params }: Props) {
  const profile = await getMerchantProfile(params.handle);
  if (!profile || !profile.public) notFound();

  return (
    <main className="min-h-screen bg-off-white">
      {/* Cover */}
      <div
        className="w-full h-40 bg-gradient-to-br from-wine to-wine/70"
        style={profile.cover_url ? { backgroundImage: `url(${profile.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      />

      <div className="max-w-2xl mx-auto px-4 pb-12">
        {/* Avatar + identity */}
        <div className="flex items-end gap-4 -mt-10 mb-6">
          <div className="h-20 w-20 rounded-2xl border-4 border-white bg-wine/10 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt={profile.display_name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-wine select-none">
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
              <span className="bg-wine/10 text-wine text-xs font-semibold px-3 py-1 rounded-full">
                {profile.category}
              </span>
            </div>
          )}

          {/* Pay button */}
          <PayButton profile={profile} />

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
            Pagamentos via <span className="font-semibold text-wine">Banzami</span>
          </p>
        </div>
      </div>
    </main>
  );
}

function PayButton({ profile }: { profile: MerchantProfile }) {
  const deepLink = `banza://pay/profile/${profile.handle}`;
  return (
    <a
      href={deepLink}
      className="flex items-center justify-center gap-2 h-14 bg-wine text-white rounded-2xl text-base font-semibold shadow-md hover:bg-wine/90 transition-colors"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </svg>
      Pagar a @{profile.handle}
    </a>
  );
}
