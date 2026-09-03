import { createClient } from '@qoe/supabase/server';
import { MessagesApp } from '@/components/messages/MessagesApp';
import { MessageCircle } from 'lucide-react';

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <MessageCircle className="w-8 h-8 mx-auto mb-3 opacity-50 text-muted-foreground" />
        <p className="text-muted-foreground">Connectez-vous pour accéder à vos messages.</p>
      </div>
    );
  }

  return <MessagesApp />;
}
