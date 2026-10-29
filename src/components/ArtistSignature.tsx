import { useQuery } from '@tanstack/react-query';
import { Image, type ImageRef } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { getArtistSignature } from '@/lib/signatureCache';
import { getAppleArtistArt } from '@/lib/appleArtistArtCache';
import { loadSignatureImage } from '@/lib/signatureImage';
import { useAuthStore } from '@/store/auth';
import { colors, fontSize, spacing } from '@/theme';
import { useSettings } from '@/store/settings';
import { publicHttpsUrl } from '@/lib/artworkSources';

/** The real name remains accessible and visible until an autograph has drawn. */
export function ArtistSignature({ name, width }: { name: string; width: number }) {
  const t = useT();
  const enabled = useSettings((s) => s.artistSignaturesEnabled);
  const appleLogos = useSettings((s) => s.appleArtistLogos);
  const offline = useAuthStore((s) => s.offline);
  const api = useSettings((s) => s.artistSignaturesApi);
  const { data } = useQuery({
    queryKey: ['artist-signature-v4', api, name, offline],
    queryFn: () => getArtistSignature(name, api),
    enabled: enabled && !!publicHttpsUrl(api),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const [displayed, setDisplayed] = useState<ImageRef>();
  const [failed, setFailed] = useState<ImageRef>();
  const providerSignature = enabled && publicHttpsUrl(api) ? data : null;
  const { data: appleSignature } = useQuery({
    queryKey: ['apple-artist-logo-v4', name, offline],
    queryFn: async () => {
      const art = await getAppleArtistArt(name);
      return art?.logo ? loadSignatureImage(art.logo, offline) : null;
    },
    enabled: appleLogos && !providerSignature,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  const signature = providerSignature ?? (appleLogos ? appleSignature : null);
  const shown = !!signature && displayed === signature.image && failed !== signature.image;
  const imageWidth = Math.min(280, width - spacing.lg * 2);
  return (
    <Pressable
      accessibilityRole={shown ? 'button' : undefined}
      accessibilityLabel={name}
      accessibilityHint={shown ? t('Show signature source') : undefined}
      disabled={!shown}
      onPress={() => Alert.alert(name, signature?.attribution || name)}
      style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, minHeight: 104, justifyContent: 'flex-end', alignItems: 'center' }}
    >
      {shown ? <View style={{ height: 88 }} /> : (
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: fontSize.xxl, fontWeight: '600', textAlign: 'center' }}>{name}</Text>
      )}
      {signature && failed !== signature.image ? (
        <Image
          source={signature.image}
          style={{ position: 'absolute', left: (width - imageWidth) / 2, bottom: spacing.md, width: imageWidth, height: 88, opacity: shown ? 1 : 0 }}
          contentFit="contain"
          contentPosition="bottom"
          tintColor={colors.text}
          recyclingKey={`${api}\n${name}\n${signature.imageUrl}`}
          onDisplay={() => setDisplayed(signature.image)}
          onError={() => setFailed(signature.image)}
          accessible={false}
        />
      ) : null}
    </Pressable>
  );
}
