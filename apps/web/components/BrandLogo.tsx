import Image from 'next/image';
import Link from 'next/link';

/** e4coach wordmark, links home. Uses the light-background logo. */
export function BrandLogo({ height = 56 }: { height?: number }) {
  const width = Math.round((height * 519.8) / 185.6);
  return (
    <Link href="/" aria-label="e4coach home" className="inline-flex items-center">
      <Image
        src="/brand/logo-light.svg"
        alt="e4coach"
        width={width}
        height={height}
        priority
      />
    </Link>
  );
}
