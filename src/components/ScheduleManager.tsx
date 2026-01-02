import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Plus, Trash2, Calendar, Music, Play, ArrowLeft, Power } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface Schedule {
  id: string;
  name: string | null;
  playlist_id: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  is_active: boolean;
  priority: number;
}

interface Playlist {
  id: string;
  name: string;
  cover_url: string | null;
}

const getDays = (t: (key: string) => string) => [
  { value: 0, label: t("schedule.daySun"), full: "Sunday" },
  { value: 1, label: t("schedule.dayMon"), full: "Monday" },
  { value: 2, label: t("schedule.dayTue"), full: "Tuesday" },
  { value: 3, label: t("schedule.dayWed"), full: "Wednesday" },
  { value: 4, label: t("schedule.dayThu"), full: "Thursday" },
  { value: 5, label: t("schedule.dayFri"), full: "Friday" },
  { value: 6, label: t("schedule.daySat"), full: "Saturday" },
];

interface ScheduleManagerProps {
  onBack?: () => void;
  schedulerEnabled?: boolean;
  onToggleScheduler?: (enabled: boolean) => void;
}

const ScheduleManager = ({ onBack, schedulerEnabled = true, onToggleScheduler }: ScheduleManagerProps) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPlaylistId, setFormPlaylistId] = useState("");
  const [formDays, setFormDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("17:00");
  const [formPriority, setFormPriority] = useState(0);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only reload when user ID changes

  const loadData = async () => {
    setIsLoading(true);

    // Load schedules
    const { data: schedulesData, error: schedulesError } = await supabase
      .from("playlist_schedules")
      .select("*")
      .eq("user_id", user!.id)
      .order("start_time");

    if (schedulesError) {
      toast({ title: "Error loading schedules", description: schedulesError.message, variant: "destructive" });
    } else {
      setSchedules(schedulesData || []);
    }

    // Load all accessible playlists
    const { data: playlistsData, error: playlistsError } = await supabase
      .from("playlists")
      .select("id, name, cover_url")
      .or(`user_id.eq.${user!.id},is_system.eq.true,is_public.eq.true`)
      .order("name");

    if (playlistsError) {
      toast({ title: "Error loading playlists", description: playlistsError.message, variant: "destructive" });
    } else {
      setPlaylists(playlistsData || []);
    }

    setIsLoading(false);
  };

  const resetForm = () => {
    setFormName("");
    setFormPlaylistId("");
    setFormDays([1, 2, 3, 4, 5]);
    setFormStartTime("09:00");
    setFormEndTime("17:00");
    setFormPriority(0);
    setEditingSchedule(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setFormName(schedule.name || "");
    setFormPlaylistId(schedule.playlist_id);
    setFormDays(schedule.days_of_week);
    setFormStartTime(schedule.start_time.slice(0, 5)); // HH:MM
    setFormEndTime(schedule.end_time.slice(0, 5));
    setFormPriority(schedule.priority);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formPlaylistId) {
      toast({ title: "Please select a playlist", variant: "destructive" });
      return;
    }

    if (formDays.length === 0) {
      toast({ title: "Please select at least one day", variant: "destructive" });
      return;
    }

    const scheduleData = {
      user_id: user!.id,
      playlist_id: formPlaylistId,
      name: formName || null,
      days_of_week: formDays,
      start_time: formStartTime,
      end_time: formEndTime,
      priority: formPriority,
      is_active: true,
    };

    if (editingSchedule) {
      const { error } = await supabase
        .from("playlist_schedules")
        .update(scheduleData)
        .eq("id", editingSchedule.id);

      if (error) {
        toast({ title: "Error updating schedule", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Schedule updated" });
        setIsDialogOpen(false);
        loadData();
      }
    } else {
      const { error } = await supabase
        .from("playlist_schedules")
        .insert(scheduleData);

      if (error) {
        toast({ title: "Error creating schedule", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Schedule created" });
        setIsDialogOpen(false);
        loadData();
      }
    }
  };

  const handleToggleActive = async (schedule: Schedule) => {
    const { error } = await supabase
      .from("playlist_schedules")
      .update({ is_active: !schedule.is_active })
      .eq("id", schedule.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSchedules(prev =>
        prev.map(s => (s.id === schedule.id ? { ...s, is_active: !s.is_active } : s))
      );
    }
  };

  const handleDelete = async (scheduleId: string) => {
    const { error } = await supabase
      .from("playlist_schedules")
      .delete()
      .eq("id", scheduleId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Schedule deleted" });
      setSchedules(prev => prev.filter(s => s.id !== scheduleId));
    }
  };

  const toggleDay = (day: number) => {
    setFormDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const getPlaylistName = (playlistId: string) => {
    return playlists.find(p => p.id === playlistId)?.name || "Unknown";
  };

  const formatDays = (days: number[]) => {
    const DAYS = getDays(t);
    if (days.length === 7) return t("schedule.everyDay");
    if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return t("schedule.weekdays");
    if (days.length === 2 && [0, 6].every(d => days.includes(d))) return t("schedule.weekends");
    return days.map(d => DAYS.find(day => day.value === d)?.label).join(", ");
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    // Create a date object to use Intl formatting
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes), 0);
    
    // Use user's locale to determine 12h vs 24h format
    return date.toLocaleTimeString(navigator.language, {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Get currently active schedule based on time (handles overnight schedules)
  const getCurrentSchedule = () => {
    if (!schedulerEnabled) return null;
    
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5);

    const matching = schedules.filter(s => {
      if (!s.is_active) return false;
      
      const startTime = s.start_time.slice(0, 5);
      const endTime = s.end_time.slice(0, 5);
      
      // Check if schedule spans midnight (e.g., 17:00 to 09:00)
      const spansOvernight = startTime > endTime;
      
      if (spansOvernight) {
        const isAfterStart = currentTime >= startTime && s.days_of_week.includes(currentDay);
        const isBeforeEnd = currentTime < endTime && s.days_of_week.includes((currentDay + 6) % 7);
        return isAfterStart || isBeforeEnd;
      } else {
        return s.days_of_week.includes(currentDay) && 
               currentTime >= startTime && 
               currentTime < endTime;
      }
    });

    if (matching.length === 0) return null;
    return matching.reduce((prev, curr) => curr.priority > prev.priority ? curr : prev);
  };

  const activeSchedule = getCurrentSchedule();

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-background to-card">
      <ScrollArea className="flex-1 h-full">
        <div className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 pb-80 sm:pb-48 pt-4 md:pt-6">
          {/* Header */}
          <div className="flex items-center animate-fade-in">
            <div className="flex items-center gap-2 shrink-0">
              {onBack && (
                <Button variant="ghost" size="icon" onClick={onBack}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              )}
              <h1 className="text-2xl font-bold text-foreground whitespace-nowrap flex items-center gap-2">
                <Clock className="hidden sm:block w-6 h-6 text-primary" />
                {t("schedule.title")}
              </h1>
            </div>
          </div>

          {/* Subtitle */}
          <p className="text-sm text-muted-foreground">{t("schedule.subtitle")}</p>

          {/* Global On/Off Toggle */}
          {onToggleScheduler && (
            <Card className={`${schedulerEnabled ? 'bg-primary/10 border-primary/30' : 'bg-muted/50 border-border'}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${schedulerEnabled ? 'bg-primary/20' : 'bg-muted'}`}>
                  <Power className={`w-5 h-5 ${schedulerEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">
                    {schedulerEnabled ? t("schedule.schedulerOn") : t("schedule.schedulerOff")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {schedulerEnabled 
                      ? t("schedule.schedulerOnDesc") 
                      : t("schedule.schedulerOffDesc")}
                  </p>
                </div>
                <Switch
                  checked={schedulerEnabled}
                  onCheckedChange={onToggleScheduler}
                />
              </CardContent>
            </Card>
          )}

          {/* Add Schedule Button */}
          <Button onClick={openCreateDialog} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            {t("schedule.addSchedule")}
          </Button>


          {/* Schedule List */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t("schedule.loading")}</div>
          ) : schedules.length === 0 ? (
            <Card className="bg-card/50">
              <CardContent className="p-8 text-center">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium text-foreground mb-2">{t("schedule.noSchedules")}</h3>
                <p className="text-muted-foreground mb-4">
                  {t("schedule.noSchedulesDesc")}
                </p>
                <Button onClick={openCreateDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t("schedule.createFirst")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {schedules.map(schedule => {
                const isCurrentlyPlaying = activeSchedule?.id === schedule.id;
                return (
                <Card
                  key={schedule.id}
                  className={`border transition-all ${
                    isCurrentlyPlaying 
                      ? "bg-primary/10 border-primary/50 ring-1 ring-primary/30" 
                      : "bg-card/80 border-border"
                  } ${!schedule.is_active ? "opacity-50" : ""}`}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      {/* Playlist Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {isCurrentlyPlaying ? (
                            <Play className="w-4 h-4 text-primary animate-pulse flex-shrink-0" />
                          ) : (
                            <Music className="w-4 h-4 text-primary flex-shrink-0" />
                          )}
                          <span className="font-medium text-foreground truncate">
                            {schedule.name || getPlaylistName(schedule.playlist_id)}
                          </span>
                          {isCurrentlyPlaying && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                              {t("schedule.nowPlaying")}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Music className="w-3 h-3" />
                            {getPlaylistName(schedule.playlist_id)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(schedule.start_time)} – {formatTime(schedule.end_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDays(schedule.days_of_week)}
                          </span>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 mt-1 sm:mt-0">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={schedule.is_active}
                            onCheckedChange={() => handleToggleActive(schedule)}
                          />
                          <span className="text-xs text-muted-foreground sm:hidden">
                            {schedule.is_active ? "On" : "Off"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(schedule)}
                          >
                            {t("schedule.edit")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(schedule.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              })}
            </div>
          )}

          {/* Tips */}
          <Card className="bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("schedule.tips")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>• {t("schedule.tip1")}</p>
              <p>• {t("schedule.tip2")}</p>
              <p>• {t("schedule.tip3")}</p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? t("schedule.editSchedule") : t("schedule.createSchedule")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>{t("schedule.scheduleName")}</Label>
              <Input
                placeholder={t("schedule.scheduleNamePlaceholder")}
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
            </div>

            {/* Playlist */}
            <div className="space-y-2">
              <Label>{t("schedule.playlist")} *</Label>
              <Select value={formPlaylistId} onValueChange={setFormPlaylistId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("schedule.selectPlaylist")} />
                </SelectTrigger>
                <SelectContent>
                  {playlists.map(playlist => (
                    <SelectItem key={playlist.id} value={playlist.id}>
                      {playlist.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Days */}
            <div className="space-y-2">
              <Label>{t("schedule.days")} *</Label>
              <div className="flex flex-wrap gap-2">
                {getDays(t).map(day => (
                  <Button
                    key={day.value}
                    type="button"
                    variant={formDays.includes(day.value) ? "default" : "outline"}
                    size="sm"
                    className="w-10"
                    onClick={() => toggleDay(day.value)}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormDays([1, 2, 3, 4, 5])}
                >
                  {t("schedule.weekdays")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormDays([0, 6])}
                >
                  {t("schedule.weekends")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormDays([0, 1, 2, 3, 4, 5, 6])}
                >
                  {t("schedule.everyDay")}
                </Button>
              </div>
            </div>

            {/* Time Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("schedule.startTime")} *</Label>
                <Input
                  type="time"
                  value={formStartTime}
                  onChange={e => setFormStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("schedule.endTime")} *</Label>
                <Input
                  type="time"
                  value={formEndTime}
                  onChange={e => setFormEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label>{t("schedule.priority")}</Label>
              <Select value={formPriority.toString()} onValueChange={v => setFormPriority(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Normal (0)</SelectItem>
                  <SelectItem value="1">High (1)</SelectItem>
                  <SelectItem value="2">Highest (2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave}>
              {t("schedule.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScheduleManager;
