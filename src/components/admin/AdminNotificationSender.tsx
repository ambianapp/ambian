import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Send, Bell } from "lucide-react";

export const AdminNotificationSender = () => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!message.trim()) return;

    setIsSending(true);
    try {
      const { error } = await supabase
        .from("admin_notifications")
        .insert({ message: message.trim() });

      if (error) throw error;

      toast({
        title: "Notification sent",
        description: "All users will see this message immediately.",
      });
      setMessage("");
    } catch (error: any) {
      console.error("Error sending notification:", error);
      toast({
        title: "Failed to send",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Broadcast Notification
          </CardTitle>
          <CardDescription>
            Send a real-time notification to all active users. This will appear as a banner without interrupting music playback.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Type your notification message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[100px]"
            maxLength={500}
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {message.length}/500 characters
            </span>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={!message.trim() || isSending}
            >
              <Send className="w-4 h-4 mr-2" />
              Send to All Users
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send notification to all users?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This message will be displayed to all currently active users:</p>
              <p className="bg-muted p-3 rounded-md text-foreground font-medium">
                "{message}"
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend} disabled={isSending}>
              {isSending ? "Sending..." : "Send Now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
