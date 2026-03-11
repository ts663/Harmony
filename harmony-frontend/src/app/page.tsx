import { redirect } from 'next/navigation';
import { publicGet } from '@/lib/trpc-client';

interface PublicServer {
  slug: string;
}

interface PublicChannel {
  slug: string;
}

/**
 * Home page — redirects to the first public channel if one exists,
 * otherwise falls back to the login page.
 */
export default async function Home() {
  try {
    const servers = await publicGet<PublicServer[]>('/servers');
    if (servers && servers.length > 0) {
      const server = servers[0];
      const result = await publicGet<{ channels: PublicChannel[] }>(
        `/servers/${server.slug}/channels`,
      );
      const firstChannel = result?.channels?.[0];
      if (firstChannel) {
        redirect(`/c/${server.slug}/${firstChannel.slug}`);
      }
    }
  } catch {
    // Backend unreachable — fall through to login
  }

  redirect('/auth/login');
}
