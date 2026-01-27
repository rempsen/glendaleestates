import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  Users, 
  UserPlus, 
  Shield, 
  ShieldCheck, 
  Key, 
  Trash2, 
  RefreshCw,
  Loader2,
  Mail,
  History,
  UserCheck,
  UserMinus,
  KeyRound,
  UserX,
  Pencil,
  Home
} from 'lucide-react';
import { unitData, getUnitInfo } from '@/lib/unitData';

interface UserData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unit_number: string | null;
  phone_number: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  roles: string[];
}

interface ActivityLog {
  id: string;
  action_type: string;
  target_user_email: string;
  performed_by_email: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; icon: typeof UserPlus; color: string }> = {
  user_created: { label: 'User Created', icon: UserPlus, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  password_reset: { label: 'Password Reset', icon: KeyRound, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  role_added: { label: 'Role Added', icon: ShieldCheck, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  role_removed: { label: 'Role Removed', icon: UserMinus, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  user_deleted: { label: 'User Deleted', icon: UserX, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  client_signup: { label: 'Client Signup', icon: UserCheck, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  user_updated: { label: 'User Updated', icon: UserCheck, color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400' },
};

export default function AdminUsers() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('users');
  
  // Create user dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  
  // Reset password dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetUserEmail, setResetUserEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Edit user dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editUnitNumber, setEditUnitNumber] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editUnitType, setEditUnitType] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      const response = await supabase.functions.invoke('manage-users', {
        body: { action: 'list' },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      setUsers(response.data.users || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityLogs = async () => {
    setLogsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      const response = await supabase.functions.invoke('manage-users', {
        body: { action: 'getLogs', limit: 100 },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      setActivityLogs(response.data.logs || []);
    } catch (error: any) {
      console.error('Error fetching activity logs:', error);
      toast.error('Failed to load activity logs: ' + error.message);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs' && activityLogs.length === 0) {
      fetchActivityLogs();
    }
  }, [activeTab]);

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    setActionLoading('create');
    try {
      const response = await supabase.functions.invoke('manage-users', {
        body: { 
          action: 'create',
          email: newUserEmail,
          password: newUserPassword,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success('User created successfully! Email notification sent.');
      setCreateDialogOpen(false);
      setNewUserEmail('');
      setNewUserPassword('');
      fetchUsers();
      // Refresh logs if on logs tab
      if (activeTab === 'logs') {
        fetchActivityLogs();
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error('Failed to create user: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleRole = async (userId: string, role: string, currentlyHasRole: boolean) => {
    setActionLoading(userId);
    try {
      const roleAction = currentlyHasRole ? 'remove' : 'add';
      const response = await supabase.functions.invoke('manage-users', {
        body: { 
          action: 'updateRole',
          userId,
          role,
          roleAction,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success(`Role ${currentlyHasRole ? 'removed' : 'added'} successfully`);
      fetchUsers();
      if (activeTab === 'logs') {
        fetchActivityLogs();
      }
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUserId || !newPassword) {
      toast.error('Please enter a new password');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setActionLoading('reset');
    try {
      const response = await supabase.functions.invoke('manage-users', {
        body: { 
          action: 'resetPassword',
          userId: resetUserId,
          newPassword,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success('Password reset successfully! User has been notified via email.');
      setResetDialogOpen(false);
      setResetUserId(null);
      setResetUserEmail('');
      setNewPassword('');
      if (activeTab === 'logs') {
        fetchActivityLogs();
      }
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast.error('Failed to reset password: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setActionLoading(userId);
    try {
      const response = await supabase.functions.invoke('manage-users', {
        body: { 
          action: 'delete',
          userId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success('User deleted successfully');
      fetchUsers();
      if (activeTab === 'logs') {
        fetchActivityLogs();
      }
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const openResetDialog = (userId: string, email: string) => {
    setResetUserId(userId);
    setResetUserEmail(email);
    setNewPassword('');
    setResetDialogOpen(true);
  };

  const openEditDialog = (user: UserData) => {
    setEditUser(user);
    setEditFirstName(user.first_name || '');
    setEditLastName(user.last_name || '');
    setEditEmail(user.email || '');
    setEditUnitNumber(user.unit_number || '');
    setEditPhoneNumber(user.phone_number || '');
    // Auto-populate unit type from unit number
    const unitNum = parseInt(user.unit_number || '0');
    const unitInfo = getUnitInfo(unitNum);
    setEditUnitType(unitInfo?.typeCode || '');
    setEditDialogOpen(true);
  };

  // Handle unit number change and auto-populate unit type
  const handleUnitNumberChange = (value: string) => {
    setEditUnitNumber(value);
    const unitNum = parseInt(value);
    const unitInfo = getUnitInfo(unitNum);
    setEditUnitType(unitInfo?.typeCode || '');
  };

  const handleUpdateUser = async () => {
    if (!editUser) return;

    setActionLoading('edit');
    try {
      const response = await supabase.functions.invoke('manage-users', {
        body: { 
          action: 'updateUser',
          userId: editUser.id,
          email: editEmail,
          firstName: editFirstName,
          lastName: editLastName,
          unitNumber: editUnitNumber,
          unitType: editUnitType, // Include unit type
          phoneNumber: editPhoneNumber,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success('User updated successfully');
      setEditDialogOpen(false);
      setEditUser(null);
      fetchUsers();
      if (activeTab === 'logs') {
        fetchActivityLogs();
      }
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const adminUsers = users.filter(u => u.roles.includes('admin'));
  const regularUsers = users.filter(u => !u.roles.includes('admin'));

  const renderUserTable = (userList: UserData[], title: string, description: string, icon: React.ReactNode) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : userList.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No users found</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Sign In</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userList.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.first_name || user.last_name 
                      ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                      : <span className="text-muted-foreground italic">—</span>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      {user.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.unit_number || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {format(new Date(user.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    {user.last_sign_in_at 
                      ? format(new Date(user.last_sign_in_at), 'MMM d, yyyy h:mm a')
                      : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.email_confirmed_at ? 'default' : 'secondary'}>
                      {user.email_confirmed_at ? 'Confirmed' : 'Pending'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={user.roles.includes('admin')}
                      onCheckedChange={() => handleToggleRole(user.id, 'admin', user.roles.includes('admin'))}
                      disabled={actionLoading === user.id}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                        title="Edit User"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openResetDialog(user.id, user.email || '')}
                        title="Reset Password"
                      >
                        <Key className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" title="Delete User">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {user.email}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteUser(user.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">User Management</h1>
            <p className="text-muted-foreground">Manage admin and buyer accounts</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              fetchUsers();
              if (activeTab === 'logs') fetchActivityLogs();
            }} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                  <DialogDescription>
                    Add a new user account. Users with @bmdmaterials.com emails are automatically assigned admin privileges. A welcome email will be sent to the user.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateUser} disabled={actionLoading === 'create'}>
                    {actionLoading === 'create' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{users.length}</p>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-accent">
                  <ShieldCheck className="w-6 h-6 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{adminUsers.length}</p>
                  <p className="text-sm text-muted-foreground">Admin Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-secondary">
                  <Shield className="w-6 h-6 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{regularUsers.length}</p>
                  <p className="text-sm text-muted-foreground">Buyer Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-muted">
                  <History className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activityLogs.length}</p>
                  <p className="text-sm text-muted-foreground">Activity Logs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Activity Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6 mt-6">
            {/* Admin Users Table */}
            {renderUserTable(
              adminUsers, 
              'Admin Users', 
              'Users with administrative privileges',
              <ShieldCheck className="w-5 h-5 text-accent-foreground" />
            )}

            {/* Regular Users Table */}
            {renderUserTable(
              regularUsers,
              'Buyer Users',
              'Regular buyer accounts',
              <Shield className="w-5 h-5 text-secondary-foreground" />
            )}
          </TabsContent>

          <TabsContent value="logs" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <History className="w-5 h-5" />
                      Activity Log
                    </CardTitle>
                    <CardDescription>Review all user management actions</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchActivityLogs} disabled={logsLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : activityLogs.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No activity logs found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Target User</TableHead>
                        <TableHead>Performed By</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activityLogs.map((log) => {
                        const actionInfo = ACTION_LABELS[log.action_type] || { 
                          label: log.action_type, 
                          icon: History, 
                          color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' 
                        };
                        const ActionIcon = actionInfo.icon;
                        
                        return (
                          <TableRow key={log.id}>
                            <TableCell>
                              <Badge className={actionInfo.color}>
                                <ActionIcon className="w-3 h-3 mr-1" />
                                {actionInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {log.target_user_email}
                            </TableCell>
                            <TableCell>
                              {log.performed_by_email}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {log.details ? (
                                <span className="font-mono text-xs">
                                  {Object.entries(log.details)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(', ')}
                                </span>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell>
                              {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Reset Password Dialog */}
        <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Set a new password for {resetUserEmail}. The user will be notified via email.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Password must be at least 6 characters
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleResetPassword} disabled={actionLoading === 'reset'}>
                {actionLoading === 'reset' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Reset Password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information. Changes will also update related buyer selections.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editFirstName">First Name</Label>
                  <Input
                    id="editFirstName"
                    placeholder="First name"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editLastName">Last Name</Label>
                  <Input
                    id="editLastName"
                    placeholder="Last name"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editEmail">Email</Label>
                <Input
                  id="editEmail"
                  type="email"
                  placeholder="user@example.com"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Changing the email will update the user's login credentials
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editUnitNumber">Unit Number</Label>
                  <Input
                    id="editUnitNumber"
                    placeholder="e.g., 25"
                    value={editUnitNumber}
                    onChange={(e) => handleUnitNumberChange(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editUnitType">Unit Type</Label>
                  <div className="flex items-center gap-2 h-10 px-3 py-2 border rounded-md bg-muted">
                    <Home className="w-4 h-4 text-muted-foreground" />
                    <span className={editUnitType ? 'font-medium' : 'text-muted-foreground'}>
                      {editUnitType || 'Auto-detected'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Auto-populated from unit number
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPhoneNumber">Phone Number</Label>
                <Input
                  id="editPhoneNumber"
                  type="tel"
                  placeholder="e.g., 204-555-1234"
                  value={editPhoneNumber}
                  onChange={(e) => setEditPhoneNumber(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateUser} disabled={actionLoading === 'edit'}>
                {actionLoading === 'edit' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
