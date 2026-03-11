import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { PageLayout } from "@/components/layout/PageLayout";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSettings, updateStoreInfo, getRetentionSettings, updateRetention, listUsers, createUser, updateUser, deactivateUser } from "@/api/settingsApi";
import type { User, CreateUserPayload, UpdateUserPayload } from "@/api/settingsApi";
import axiosClient from "@/api/axiosClient";
import { Loader2, Upload, Edit2, Trash2, Plus, RotateCcw } from "lucide-react";

// Helper function to extract error message
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    if (err.response && typeof err.response === "object") {
      const response = err.response as Record<string, unknown>;
      if (response.data && typeof response.data === "object") {
        const data = response.data as Record<string, unknown>;
        if (typeof data.message === "string") {
          return data.message;
        }
      }
    }
    if (typeof err.message === "string") {
      return err.message;
    }
  }
  return "An unknown error occurred";
};

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Redirect non-owners
  useEffect(() => {
    if (user && user.role !== "owner") {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  // Tab state
  const [activeTab, setActiveTab] = useState("store");

  // Store Information state
  const [storeFormData, setStoreFormData] = useState({
    store_name: "",
    owner_name: "",
    phone_number: "",
    email_address: "",
    physical_address: "",
    city: "",
  });
  const [logoUrl, setLogoUrl] = useState<string>("");

  // Retention state
  const [retentionDays, setRetentionDays] = useState(30);

  // Users state
  const [usersPage, setUsersPage] = useState(1);
  const [isCreateUserSheetOpen, setIsCreateUserSheetOpen] = useState(false);
  const [isEditUserSheetOpen, setIsEditUserSheetOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<User | null>(null);
  const [newUserForm, setNewUserForm] = useState({ name: "", email: "", role: "staff", password: "", phone: "" });
  const [editUserForm, setEditUserForm] = useState({ name: "", phone: "" });
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null);

  // Account Settings state
  const [changeEmailEmail, setChangeEmailEmail] = useState("");
  const [changePasswordForm, setChangePasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  // Fetch Settings
  // Fetch Settings
  const { data: settingsData, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  // Handle settings data changes
  useEffect(() => {
    if (settingsData) {
      setStoreFormData({
        store_name: settingsData.store_info.store_name || "",
        owner_name: settingsData.store_info.owner_name || "",
        phone_number: settingsData.store_info.phone_number || "",
        email_address: settingsData.store_info.email_address || "",
        physical_address: settingsData.store_info.physical_address || "",
        city: settingsData.store_info.city || "",
      });
      setLogoUrl(settingsData.store_info.logo_url || "");
      setRetentionDays(settingsData.purge_after_days);
      if (user) setChangeEmailEmail(user.email);
    }
  }, [settingsData, user]);
  // Fetch Users
  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["settings-users", usersPage],
    queryFn: () => listUsers(usersPage, 10),
  });

  // Update Store Info mutation
  const updateStoreInfoMutation = useMutation({
    mutationFn: updateStoreInfo,
    onSuccess: (data) => {
      setLogoUrl(data.store_info.logo_url || "");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Store information updated" });
    },
    onError: (error: unknown) => {
      const errorMsg = getErrorMessage(error) || "Failed to update store information";
      console.error("Store update error:", error);
      toast({ title: errorMsg, variant: "destructive" });
    },
  });

  // Update Retention mutation
  const updateRetentionMutation = useMutation({
    mutationFn: updateRetention,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Retention settings updated" });
    },
    onError: (error: unknown) => {
      const errorMsg = getErrorMessage(error) || "Failed to update retention settings";
      console.error("Retention update error:", error);
      toast({ title: errorMsg, variant: "destructive" });
    },
  });

  // Create User mutation
  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
      setIsCreateUserSheetOpen(false);
      setNewUserForm({ name: "", email: "", role: "staff", password: "", phone: "" });
      toast({ title: "User created successfully" });
    },
    onError: (error: unknown) => {
      const errorMsg = getErrorMessage(error) || "Failed to create user";
      console.error("Create user error:", error);
      toast({ title: errorMsg, variant: "destructive" });
    },
  });

  // Update User mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) => updateUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
      setIsEditUserSheetOpen(false);
      setSelectedUserForEdit(null);
      setEditUserForm({ name: "", phone: "" });
      toast({ title: "User updated successfully" });
    },
    onError: (error: unknown) => {
      const errorMsg = getErrorMessage(error) || "Failed to update user";
      console.error("Update user error:", error);
      toast({ title: errorMsg, variant: "destructive" });
    },
  });

  // Deactivate User mutation
  const deactivateUserMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
      setIsDeactivateDialogOpen(false);
      setUserToDeactivate(null);
      toast({ title: "User status updated" });
    },
    onError: (error: unknown) => {
      const errorMsg = getErrorMessage(error) || "Failed to update user status";
      console.error("Deactivate user error:", error);
      toast({ title: errorMsg, variant: "destructive" });
    },
  });

  // Handle store form
  const handleStoreFormChange = (field: string, value: string) => {
    setStoreFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleStoreFormSubmit = async () => {
    await updateStoreInfoMutation.mutateAsync({
      ...storeFormData,
      logo_url: logoUrl,
    });
  };

  // Handle logo upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadLogoMutation = useMutation({
    mutationFn: async (base64: string) => {
      const response = await axiosClient.post('/settings/logo', { logo_base64: base64 });
      if (!response.data?.success) throw new Error(response.data?.message ?? 'Upload failed');
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: 'Logo saved successfully' });
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to save logo',
        description: err?.message ?? 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: async () => {
      const response = await axiosClient.delete('/settings/logo');
      if (!response.data?.success) throw new Error('Remove failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: 'Logo removed' });
    },
    onError: () => {
      toast({ title: 'Failed to remove logo', variant: 'destructive' });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size check — 200KB
    if (file.size > 200 * 1024) {
      toast({
        title: 'File too large',
        description: 'Logo must be under 200KB. Please resize the image and try again.',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    // Allowed types
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Only PNG, JPG, WEBP, and SVG files are allowed.',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      uploadLogoMutation.mutate(base64);
    };
    reader.onerror = () => {
      toast({ title: 'Failed to read file', variant: 'destructive' });
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset so same file can be re-selected
  };

  // Handle retention form
  const handleRetentionSubmit = async () => {
    if (retentionDays < 7 || retentionDays > 365) {
      toast({ title: "Purge days must be between 7 and 365", variant: "destructive" });
      return;
    }
    await updateRetentionMutation.mutateAsync({ purge_after_days: retentionDays });
  };

  // Handle user creation
  const handleCreateUserSubmit = async () => {
    if (!newUserForm.name || !newUserForm.email || !newUserForm.password) {
      toast({ title: "Name, email, and password are required", variant: "destructive" });
      return;
    }
    if (newUserForm.password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    const payload: CreateUserPayload = {
      name: newUserForm.name,
      email: newUserForm.email,
      role: newUserForm.role as "manager" | "staff",
      password: newUserForm.password,
      phone: newUserForm.phone || undefined,
    };
    await createUserMutation.mutateAsync(payload);
  };

  // Handle user edit
  const handleEditUserSubmit = async () => {
    if (!selectedUserForEdit) return;

    const payload: UpdateUserPayload = {
      name: editUserForm.name || undefined,
      phone: editUserForm.phone || undefined,
    };
    await updateUserMutation.mutateAsync({ id: selectedUserForEdit._id, payload });
  };

  // Handle deactivate user
  const handleDeactivateUser = async () => {
    if (!userToDeactivate) return;
    await deactivateUserMutation.mutateAsync(userToDeactivate._id);
  };

  // Handle change email
  const handleChangeEmail = async () => {
    if (!changeEmailEmail) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    // In a real implementation, this would call an API
    // For now, we'll show that it's redirecting to login
    toast({ title: "Email updated. You will be logged out." });
    setTimeout(() => {
      logout();
      navigate("/login");
    }, 2000);
  };

  // Change Password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
      const response = await axiosClient.patch('/auth/me/password', { currentPassword, newPassword });
      if (!response.data?.success) throw new Error(response.data?.message ?? 'Password change failed');
      return response.data;
    },
    onSuccess: () => {
      setChangePasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast({ title: 'Password changed successfully. Please log in again.' });
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 1500);
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to change password',
        description: err?.message ?? 'Please try again',
        variant: 'destructive',
      });
    },
  });

  // Handle change password
  const handleChangePassword = async () => {
    if (!changePasswordForm.currentPassword || !changePasswordForm.newPassword) {
      toast({ title: "Current password and new password are required", variant: "destructive" });
      return;
    }
    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (changePasswordForm.newPassword.length < 8) {
      toast({ title: "New password must be at least 8 characters", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: changePasswordForm.currentPassword,
      newPassword: changePasswordForm.newPassword,
    });
  };

  return (
    <PageLayout title="Settings" showPeriodFilter={false}>
      {isLoadingSettings ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
      <div className="space-y-6">

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="store">Store Info</TabsTrigger>
          <TabsTrigger value="logo">Logo</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        {/* Store Information Tab */}
        <TabsContent value="store">
          <Card>
            <CardHeader>
              <CardTitle>Store Information</CardTitle>
              <CardDescription>Update your business details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Store Name</Label>
                  <Input value={storeFormData.store_name} onChange={(e) => handleStoreFormChange("store_name", e.target.value)} placeholder="StockCore Demo" />
                </div>
                <div className="space-y-2">
                  <Label>Owner Name</Label>
                  <Input value={storeFormData.owner_name} onChange={(e) => handleStoreFormChange("owner_name", e.target.value)} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input value={storeFormData.phone_number} onChange={(e) => handleStoreFormChange("phone_number", e.target.value)} placeholder="+8801234567890" />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input type="email" value={storeFormData.email_address} onChange={(e) => handleStoreFormChange("email_address", e.target.value)} placeholder="store@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Physical Address</Label>
                  <Input value={storeFormData.physical_address} onChange={(e) => handleStoreFormChange("physical_address", e.target.value)} placeholder="123 Main St" />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={storeFormData.city} onChange={(e) => handleStoreFormChange("city", e.target.value)} placeholder="Dhaka" />
                </div>
              </div>
              <Button onClick={handleStoreFormSubmit} disabled={updateStoreInfoMutation.isPending} className="w-full">
                {updateStoreInfoMutation.isPending ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logo Tab */}
        <TabsContent value="logo">
          <Card>
            <CardHeader>
              <CardTitle>Store Logo</CardTitle>
              <CardDescription>Upload your business logo (PNG, JPG, SVG - Max 2MB)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {logoUrl && (
                <div className="flex justify-center">
                  <img src={logoUrl} alt="Store Logo" className="max-w-xs max-h-48 rounded-lg" />
                </div>
              )}
              <div className="flex flex-col gap-4">
                <label className="flex items-center justify-center w-full p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
                  <div className="space-y-2 text-center">
                    <Upload className="mx-auto w-8 h-8 text-gray-400" />
                    <span className="text-sm">Click to upload logo</span>
                  </div>
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    accept="image/png,image/jpeg,image/webp,image/svg+xml" 
                    onChange={handleFileChange} 
                    disabled={uploadLogoMutation.isPending} 
                    className="hidden" 
                  />
                </label>
                {uploadLogoMutation.isPending && <div className="text-center text-sm text-gray-500">Uploading...</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Staff Accounts</CardTitle>
                <CardDescription>Create and manage user accounts</CardDescription>
              </div>
              <Button onClick={() => setIsCreateUserSheetOpen(true)}>
                <Plus className="mr-2 w-4 h-4" />
                Add User
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingUsers ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : usersData && usersData.users.length > 0 ? (
                <div className="space-y-4">
                  {usersData.users.map((u) => (
                    <div key={u._id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-semibold">{u.name}</div>
                        <div className="text-sm text-gray-500">{u.email}</div>
                        <div className="text-xs mt-1">
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded">{u.role}</span>
                          {u.phone && <span className="ml-2 text-gray-600">{u.phone}</span>}
                          <span className={`ml-2 px-2 py-1 rounded text-xs ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{u.is_active ? "Active" : "Inactive"}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setSelectedUserForEdit(u); setEditUserForm({ name: u.name, phone: u.phone || "" }); setIsEditUserSheetOpen(true); }}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setUserToDeactivate(u); setIsDeactivateDialogOpen(true); }}>
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Pagination */}
                  {usersData.pagination && usersData.pagination.pages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <Button disabled={usersPage === 1} onClick={() => setUsersPage(usersPage - 1)} variant="outline">
                        Previous
                      </Button>
                      <span className="text-sm">
                        Page {usersPage} of {usersData.pagination.pages}
                      </span>
                      <Button disabled={usersPage === usersData.pagination.pages} onClick={() => setUsersPage(usersPage + 1)} variant="outline">
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">No users found</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Retention Settings Tab */}
        <TabsContent value="retention">
          <Card>
            <CardHeader>
              <CardTitle>Retention Settings</CardTitle>
              <CardDescription>Configure how long deleted items are retained before permanent deletion</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Financial records are retained for 3 years (required by law)</strong>
                </p>
              </div>

              <div className="space-y-4">
                <Label>Purge deleted items after (days)</Label>
                <Input type="number" min="7" max="365" value={retentionDays} onChange={(e) => setRetentionDays(parseInt(e.target.value) || 30)} />
                <p className="text-xs text-gray-500">Range: 7 to 365 days</p>
              </div>

              <div className="flex gap-2">
                {[7, 30, 90, 180].map((days) => (
                  <Button key={days} variant={retentionDays === days ? "default" : "outline"} onClick={() => setRetentionDays(days)}>
                    {days}d
                  </Button>
                ))}
              </div>

              <Button onClick={handleRetentionSubmit} disabled={updateRetentionMutation.isPending} className="w-full">
                {updateRetentionMutation.isPending ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Settings Tab */}
        <TabsContent value="account">
          <div className="space-y-4">
            {/* Change Email */}
            <Card>
              <CardHeader>
                <CardTitle>Change Email</CardTitle>
                <CardDescription>Update your login email address</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Current Email</Label>
                  <Input value={changeEmailEmail} disabled className="bg-gray-100" />
                </div>
                <div className="space-y-2">
                  <Label>New Email</Label>
                  <Input type="email" placeholder="newemail@example.com" onChange={(e) => setChangeEmailEmail(e.target.value)} />
                </div>
                <Button onClick={handleChangeEmail} className="w-full">
                  Update Email
                </Button>
              </CardContent>
            </Card>

            {/* Change Password */}
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your account password (minimum 8 characters)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input type="password" value={changePasswordForm.currentPassword} onChange={(e) => setChangePasswordForm({ ...changePasswordForm, currentPassword: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" value={changePasswordForm.newPassword} onChange={(e) => setChangePasswordForm({ ...changePasswordForm, newPassword: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input type="password" value={changePasswordForm.confirmPassword} onChange={(e) => setChangePasswordForm({ ...changePasswordForm, confirmPassword: e.target.value })} />
                </div>
                <Button onClick={handleChangePassword} disabled={changePasswordMutation.isPending} className="w-full">
                  {changePasswordMutation.isPending ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : null}
                  Update Password
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create User Sheet */}
      <Sheet open={isCreateUserSheetOpen} onOpenChange={setIsCreateUserSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Create New User</SheetTitle>
            <SheetDescription className="sr-only">
              Form to create a new user account with name, email, role, and password
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newUserForm.name} onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={newUserForm.email} onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })} placeholder="user@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newUserForm.role} onValueChange={(value) => setNewUserForm({ ...newUserForm, role: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Temporary Password</Label>
              <Input type="password" value={newUserForm.password} onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })} placeholder="Min 8 characters" />
            </div>
            <div className="space-y-2">
              <Label>Phone (Optional)</Label>
              <Input value={newUserForm.phone} onChange={(e) => setNewUserForm({ ...newUserForm, phone: e.target.value })} placeholder="+880123456789" />
            </div>
            <Button onClick={handleCreateUserSubmit} disabled={createUserMutation.isPending} className="w-full">
              {createUserMutation.isPending ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : null}
              Create User
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit User Sheet */}
      <Sheet open={isEditUserSheetOpen} onOpenChange={setIsEditUserSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit User</SheetTitle>
            <SheetDescription className="sr-only">
              Form to edit user name and phone information
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Email (Read-only)</Label>
              <Input value={selectedUserForEdit?.email || ""} disabled className="bg-gray-100" />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editUserForm.name} onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={editUserForm.phone} onChange={(e) => setEditUserForm({ ...editUserForm, phone: e.target.value })} />
            </div>
            <Button onClick={handleEditUserSubmit} disabled={updateUserMutation.isPending} className="w-full">
              {updateUserMutation.isPending ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : null}
              Update User
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Deactivate User Dialog */}
      <AlertDialog open={isDeactivateDialogOpen} onOpenChange={setIsDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              {userToDeactivate?.is_active ? "User will no longer be able to login." : "User will be reactivated and able to login again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <p className="font-semibold">{userToDeactivate?.name}</p>
            <p className="text-sm text-gray-500">{userToDeactivate?.email}</p>
          </div>
          <div className="flex gap-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivateUser} disabled={deactivateUserMutation.isPending}>
              {deactivateUserMutation.isPending ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : null}
              {userToDeactivate?.is_active ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      </div>
      )}
    </PageLayout>
  );
}

