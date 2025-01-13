import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch } from "@/store";
import { createChannel } from "@/store/channelSlice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const channelSchema = z.object({
  name: z.string()
    .min(1, "Channel name is required")
    .max(50, "Channel name cannot exceed 50 characters")
    .refine(value => /^[a-zA-Z0-9-_]+$/.test(value), {
      message: "Name can only contain letters, numbers, hyphens and underscores"
    }),
  channelType: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  topic: z.string().optional(),
});

interface ChannelCreateDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChannelCreated?: () => void;
}

export function ChannelCreateDialog({
  workspaceId,
  open,
  onOpenChange,
  onChannelCreated,
}: ChannelCreateDialogProps) {
  const { toast } = useToast();
  const dispatch = useAppDispatch();

  const form = useForm<z.infer<typeof channelSchema>>({
    resolver: zodResolver(channelSchema),
    defaultValues: {
      name: "",
      channelType: "PUBLIC",
      topic: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof channelSchema>) => {
    try {
      await dispatch(createChannel({ 
        workspaceId, 
        channel: {
          name: data.name.trim(),
          channelType: data.channelType,
          topic: data.topic || undefined,
        }
      })).unwrap();

      toast({
        title: "Success",
        description: `Channel #${data.name} has been created`,
      });

      onChannelCreated?.();
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create channel",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create a channel</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g. project-updates" 
                      {...field} 
                      autoComplete="off"
                      autoFocus
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="channelType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="PUBLIC" id="public" />
                        <Label htmlFor="public">Public</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="PRIVATE" id="private" />
                        <Label htmlFor="private">Private</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="topic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topic (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Add a topic" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset();
                  onOpenChange(false);
                }}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Creating..." : "Create Channel"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}