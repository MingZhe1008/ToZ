using System;
using System.Runtime.InteropServices;
using System.Threading;

// Keeps only the supplied ToZ HWND at desktop level. Never changes Explorer styles.
internal static class DesktopLayer {
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string name,string title);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string name,string title);
    delegate bool EnumWindowProc(IntPtr hwnd,IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowProc callback,IntPtr data);
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr hwnd,int index);
    [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] static extern IntPtr SetWindowLongPtr(IntPtr hwnd,int index,IntPtr value);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd,int command);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint process);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd,uint command);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd,int attribute,out int value,int size);
    static IntPtr window,originalOwner,desktopOwner;
    static uint ownerProcess;
    static bool desktop=true,visible=false;
    static readonly object gate=new object();
    static bool OwnWindow(){uint process;return IsWindow(window)&&GetWindowThreadProcessId(window,out process)!=0&&process==ownerProcess;}
    static IntPtr FindDesktopOwner() {
        // Explorer may host its icon view in Progman or an existing WorkerW.
        // Discover that host without creating/reparenting any Explorer windows.
        if(IsWindow(desktopOwner)&&FindWindowEx(desktopOwner,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero)return desktopOwner;
        IntPtr found=IntPtr.Zero;
        EnumWindows((hwnd,data)=>{if(FindWindowEx(hwnd,IntPtr.Zero,"SHELLDLL_DefView",null)==IntPtr.Zero)return true;found=hwnd;return false;},IntPtr.Zero);
        desktopOwner=found!=IntPtr.Zero?found:FindWindow("Progman",null);return desktopOwner;
    }
    static void Apply() {
        if(!OwnWindow())return;
        if(!visible && IsWindowVisible(window))ShowWindow(window,0);
        if(desktop){
            IntPtr shell=FindDesktopOwner();
            if(shell!=IntPtr.Zero && GetWindow(window,4)!=shell){
                SetWindowLongPtr(window,-8,shell);
                if(GetWindow(window,4)!=shell)throw new Exception("Cannot assign desktop owner");
            }
            // Explicit hide/logout is authoritative. Only recover shell minimization
            // while the application says that the desktop widget should be visible.
            if(visible && (!IsWindowVisible(window)||IsIconic(window)))ShowWindow(window,4);
            SetWindowPos(window,new IntPtr(1),0,0,0,0,0x0013);
        }else{
            if(GetWindow(window,4)!=originalOwner)SetWindowLongPtr(window,-8,IsWindow(originalOwner)?originalOwner:IntPtr.Zero);
            if(visible && (GetWindowLongPtr(window,-20).ToInt64()&8)==0)SetWindowPos(window,new IntPtr(-1),0,0,0,0,0x0013);
        }
    }
    static int Main(string[] args) {
        try {
            SetProcessDpiAwarenessContext(new IntPtr(-4));
            window=new IntPtr(long.Parse(args[0]));uint process;ownerProcess=uint.Parse(args[1]);
            GetWindowThreadProcessId(window,out process);
            if(!OwnWindow())throw new Exception("Invalid ToZ window");
            originalOwner=GetWindow(window,4);
            using(var timer=new Timer(_=>{lock(gate){Apply();}},null,Timeout.Infinite,500)){
                string line;
                while((line=Console.ReadLine())!=null){
                    lock(gate){
                        if(line=="stop")break;
                        var values=line.Split(' ');desktop=values[0]=="desktop";visible=values.Length>1&&values[1]=="visible";
                        Apply();
                        int cloaked;DwmGetWindowAttribute(window,14,out cloaked,4);
                        bool covered=false;IntPtr cursor=window;long compare=values.Length>2?long.Parse(values[2]):0;
                        for(int i=0;i<10000&&(cursor=GetWindow(cursor,3))!=IntPtr.Zero;i++)if(cursor.ToInt64()==compare){covered=true;break;}
                        Console.WriteLine("{\"ok\":true,\"desktop\":"+(desktop?"true":"false")+",\"visible\":"+(IsWindowVisible(window)?"true":"false")+",\"iconic\":"+(IsIconic(window)?"true":"false")+",\"cloaked\":"+cloaked+",\"covered\":"+(covered?"true":"false")+",\"topmost\":"+((GetWindowLongPtr(window,-20).ToInt64()&8)!=0?"true":"false")+",\"owner\":\""+GetWindow(window,4).ToInt64()+"\"}");Console.Out.Flush();
                        timer.Change(500,500);
                    }
                }
            }
            lock(gate){if(OwnWindow())SetWindowLongPtr(window,-8,IsWindow(originalOwner)?originalOwner:IntPtr.Zero);}return 0;
        }catch(Exception error){Console.Error.WriteLine(error.Message);return 1;}
    }
}
