using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ToZ.Setup {
  static class Palette {
    public static Rectangle R(Graphics g,int x,int y,int w,int h){float k=g.DpiX/96f;return new Rectangle((int)(x*k),(int)(y*k),(int)(w*k),(int)(h*k));}
    public static Point P(Graphics g,int x,int y){float k=g.DpiX/96f;return new Point((int)(x*k),(int)(y*k));}
    public static readonly Color Paper=Color.FromArgb(41,41,44),Side=Color.FromArgb(35,35,37),Chrome=Color.FromArgb(37,37,39),Line=Color.FromArgb(61,61,65),Ink=Color.FromArgb(240,240,242),Muted=Color.FromArgb(176,176,183);
    // Paint the whole control before its rounded surface; native themed backgrounds
    // otherwise leave black/white pixels in corners and on checkbox cards.
    public static void ClearSurface(Graphics graphics,Control control){graphics.Clear(control.Parent==null?Paper:control.Parent.BackColor);}
    public static GraphicsPath Round(Rectangle r,int radius){var p=new GraphicsPath();int d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
  }
  class SoftPanel:Panel {
    public SoftPanel(){DoubleBuffered=true;BackColor=Palette.Paper;}
    protected override void OnPaintBackground(PaintEventArgs e){Palette.ClearSurface(e.Graphics,this);}
    protected override void OnPaint(PaintEventArgs e){Palette.ClearSurface(e.Graphics,this);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var shape=Palette.Round(new Rectangle(0,0,Width-1,Height-1),12))using(var pen=new Pen(Palette.Line))using(var fill=new SolidBrush(BackColor)){e.Graphics.FillPath(fill,shape);e.Graphics.DrawPath(pen,shape);}base.OnPaint(e);}
  }
  class SoftButton:Button {
    public bool Primary;
    public SoftButton(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.ResizeRedraw,true);UseVisualStyleBackColor=false;BackColor=Palette.Chrome;FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;Cursor=Cursors.Hand;Font=new Font("Microsoft YaHei UI",10);}
    protected override void OnPaintBackground(PaintEventArgs e){Palette.ClearSurface(e.Graphics,this);}
    protected override void OnPaint(PaintEventArgs e){Palette.ClearSurface(e.Graphics,this);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;var fill=Primary?Color.FromArgb(229,229,234):Palette.Chrome;using(var shape=Palette.Round(new Rectangle(1,1,Width-3,Height-3),10))using(var brush=new SolidBrush(fill))using(var border=new Pen(Primary?fill:Palette.Line)){e.Graphics.FillPath(brush,shape);e.Graphics.DrawPath(border,shape);}var ink=Enabled?(Primary?Palette.Chrome:Palette.Ink):Palette.Muted;TextRenderer.DrawText(e.Graphics,Text,Font,ClientRectangle,ink,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(e.Graphics,new Rectangle(5,5,Width-10,Height-10),ink,fill);}
  }
  class ChoiceCard:RadioButton {
    public string Note="";
    public ChoiceCard(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.ResizeRedraw,true);UseVisualStyleBackColor=false;Font=new Font("Microsoft YaHei UI",11);BackColor=Palette.Paper;ForeColor=Palette.Ink;Cursor=Cursors.Hand;}
    protected override void OnPaintBackground(PaintEventArgs e){Palette.ClearSurface(e.Graphics,this);}
    protected override void OnPaint(PaintEventArgs e){Palette.ClearSurface(e.Graphics,this);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var p=Palette.Round(new Rectangle(1,1,Width-3,Height-3),12))using(var b=new SolidBrush(Checked?Color.FromArgb(51,51,54):Palette.Paper))using(var pen=new Pen(Checked?Color.FromArgb(102,102,110):Palette.Line)){e.Graphics.FillPath(b,p);e.Graphics.DrawPath(pen,p);}using(var pen=new Pen(Checked?Palette.Ink:Palette.Muted,1.5f))e.Graphics.DrawEllipse(pen,Palette.R(e.Graphics,20,25,16,16));if(Checked)using(var b=new SolidBrush(Palette.Ink))e.Graphics.FillEllipse(b,Palette.R(e.Graphics,24,29,8,8));TextRenderer.DrawText(e.Graphics,Text,Font,Palette.R(e.Graphics,52,20,(int)(Width/(e.Graphics.DpiX/96f))-70,28),Palette.Ink,TextFormatFlags.Left);using(var f=new Font("Microsoft YaHei UI",9))TextRenderer.DrawText(e.Graphics,Note,f,Palette.R(e.Graphics,52,51,(int)(Width/(e.Graphics.DpiX/96f))-70,26),Palette.Muted,TextFormatFlags.Left);if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(e.Graphics,new Rectangle(8,8,Width-16,Height-16));}
    protected override void OnCheckedChanged(EventArgs e){Invalidate();base.OnCheckedChanged(e);}
  }
  class HabitCard:CheckBox {
    public string Note="";
    public HabitCard(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.ResizeRedraw,true);UseVisualStyleBackColor=false;Font=new Font("Microsoft YaHei UI",11);BackColor=Palette.Paper;ForeColor=Palette.Ink;Cursor=Cursors.Hand;}
    protected override void OnPaintBackground(PaintEventArgs e){Palette.ClearSurface(e.Graphics,this);}
    protected override void OnPaint(PaintEventArgs e){Palette.ClearSurface(e.Graphics,this);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var p=Palette.Round(new Rectangle(1,1,Width-3,Height-3),12))using(var fill=new SolidBrush(Palette.Paper))using(var pen=new Pen(Palette.Line)){e.Graphics.FillPath(fill,p);e.Graphics.DrawPath(pen,p);}using(var pen=new Pen(Palette.Muted,1.5f))e.Graphics.DrawRectangle(pen,Palette.R(e.Graphics,20,26,16,16));if(Checked)using(var pen=new Pen(Palette.Ink,2)){e.Graphics.DrawLines(pen,new[]{Palette.P(e.Graphics,23,34),Palette.P(e.Graphics,28,39),Palette.P(e.Graphics,34,29)});}TextRenderer.DrawText(e.Graphics,Text,Font,Palette.R(e.Graphics,52,19,(int)(Width/(e.Graphics.DpiX/96f))-70,28),Palette.Ink,TextFormatFlags.Left);using(var f=new Font("Microsoft YaHei UI",9))TextRenderer.DrawText(e.Graphics,Note,f,Palette.R(e.Graphics,52,50,(int)(Width/(e.Graphics.DpiX/96f))-70,40),Palette.Muted,TextFormatFlags.WordBreak);if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(e.Graphics,new Rectangle(8,8,Width-16,Height-16));}
    protected override void OnCheckedChanged(EventArgs e){Invalidate();base.OnCheckedChanged(e);}
  }
  static class InstallEngine {
    internal const string InstallKey=@"Software\1d101d23-307c-5be8-9c21-3a83d6538425";
    internal const string RunKey=@"Software\Microsoft\Windows\CurrentVersion\Run";
    internal static string ValidatePath(string value){
      if(String.IsNullOrWhiteSpace(value)||value.Length<3||!Char.IsLetter(value[0])||value[1]!=':'||(value[2]!='\\'&&value[2]!='/')||value.IndexOfAny(new[]{'"','\r','\n','\0'})>=0)throw new ArgumentException("请选择本机磁盘中的完整安装目录。");
      string full=Path.GetFullPath(value.Trim()).TrimEnd('\\','/');
      if(full.Length>220||full.Length<=Path.GetPathRoot(full).TrimEnd('\\').Length||new[]{Environment.GetFolderPath(Environment.SpecialFolder.Windows),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)}.Any(p=>String.Equals(p.TrimEnd('\\'),full,StringComparison.OrdinalIgnoreCase)))throw new ArgumentException("请为 ToZ 选择单独的程序文件夹，路径长度不超过 220 个字符。");
      return full;
    }
    internal static string Arguments(bool all,string directory,bool desktop,bool menu){return "/S "+(all?"/allusers":"/currentuser")+" /HOSTSTARTUP=1 /DESKTOP="+(desktop?"1":"0")+" /STARTMENU="+(menu?"1":"0")+" /D="+ValidatePath(directory);}
    internal static string Existing(bool all){using(var key=(all?Registry.LocalMachine:Registry.CurrentUser).OpenSubKey(InstallKey)){return key==null?null:key.GetValue("InstallLocation") as string;}}
    internal static bool Startup(){using(var key=Registry.CurrentUser.OpenSubKey(RunKey)){return key!=null&&!String.IsNullOrEmpty(key.GetValue("ToZ") as string);}}
    internal static void SetStartup(bool enabled,string executable){using(var key=Registry.CurrentUser.CreateSubKey(RunKey)){if(enabled)key.SetValue("ToZ","\""+executable+"\" --autostart");else key.DeleteValue("ToZ",false);}}
    internal static int Run(bool all,string directory,bool desktop,bool menu){
#if UI_PREVIEW
      throw new InvalidOperationException("隔离界面验收程序禁止执行安装。");
#else
      string temp=Path.Combine(Path.GetTempPath(),"ToZ-Setup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);string engine=Path.Combine(temp,"ToZ-Engine.exe");
      try{
        using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream("ToZ.Engine"))using(var output=File.Create(engine)){if(input==null)throw new InvalidDataException("缺少安装引擎，请重新获取完整安装包。");input.CopyTo(output);}
        using(var sha=SHA256.Create())using(var file=File.OpenRead(engine)){if(BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant()!=BuildInfo.EngineSha256)throw new InvalidDataException("安装引擎校验失败，请重新获取安装包。");}
        var start=new ProcessStartInfo(engine,Arguments(all,directory,desktop,menu)){UseShellExecute=all,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};if(all)start.Verb="runas";
        using(var process=Process.Start(start)){process.WaitForExit();return process.ExitCode;}
      }finally{try{if(File.Exists(engine))File.Delete(engine);Directory.Delete(temp,false);}catch(IOException){}catch(UnauthorizedAccessException){}}
#endif
    }
  }
  class InstallerForm:Form {
    Panel content,side,footer;Label status,stepOne,stepTwo,stepThree;SoftButton next,back,cancel;ChoiceCard current,all;TextBox pathInput;HabitCard desktopChoice,menuChoice,startupChoice;CheckBox launch;
    int step;float uiScale=1;bool allUsers,desktop=true,startMenu=true,autoStart,busy=false,complete=false;string directory,currentPath,machinePath,notice="";
    int PageWidth{get{return (int)(content.ClientSize.Width/uiScale);}}
    void ScalePage(){if(uiScale!=1)foreach(Control control in content.Controls)control.Scale(new SizeF(uiScale,uiScale));}
    readonly Font bodyFont=new Font("Microsoft YaHei UI",11),smallFont=new Font("Microsoft YaHei UI",9),titleFont=new Font("Microsoft YaHei UI",22,FontStyle.Bold);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr window,int attribute,ref int value,int size);
    public InstallerForm(){
      AutoScaleMode=AutoScaleMode.None;Text="ToZ 安装";ClientSize=new Size(974,690);MinimumSize=new Size(900,720);StartPosition=FormStartPosition.CenterScreen;BackColor=Palette.Paper;ForeColor=Palette.Ink;Font=bodyFont;MaximizeBox=false;
      using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("ToZ.Icon")){if(stream!=null)Icon=new Icon(stream);}
      currentPath=InstallEngine.Existing(false)??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","ToZ");machinePath=InstallEngine.Existing(true)??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"ToZ");allUsers=InstallEngine.Existing(false)==null&&InstallEngine.Existing(true)!=null;autoStart=InstallEngine.Startup();
#if UI_PREVIEW
      currentPath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","ToZ");machinePath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"ToZ");allUsers=false;autoStart=false;
#endif
      directory=allUsers?machinePath:currentPath;
      side=new Panel{Dock=DockStyle.Left,Width=250,BackColor=Palette.Side,Padding=new Padding(32)};footer=new Panel{Dock=DockStyle.Bottom,Height=86,BackColor=Palette.Chrome};content=new Panel{Dock=DockStyle.Fill,BackColor=Palette.Paper,AutoScroll=true,Padding=new Padding(40)};
      Controls.Add(content);Controls.Add(side);Controls.Add(footer);
      var logo=new PictureBox{Bounds=new Rectangle(32,38,68,68),SizeMode=PictureBoxSizeMode.Zoom};using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("ToZ.Brand")){if(stream!=null)using(var source=Image.FromStream(stream))logo.Image=new Bitmap(source);}side.Controls.Add(logo);
      AddLabel(side,"ToZ",new Rectangle(32,128,180,42),new Font("Segoe UI",20,FontStyle.Bold),Palette.Ink);AddLabel(side,"让开始有迹可循。",new Rectangle(32,176,190,25),smallFont,Palette.Muted);
      stepOne=AddLabel(side,"❶   安装位置",new Rectangle(32,254,200,32),bodyFont,Palette.Ink);stepTwo=AddLabel(side,"②   使用习惯",new Rectangle(32,306,200,32),bodyFont,Palette.Muted);stepThree=AddLabel(side,"③   准备就绪",new Rectangle(32,358,200,32),bodyFont,Palette.Muted);
      var platform=AddLabel(side,"Windows · x64\nToZ "+BuildInfo.Version,new Rectangle(32,side.Height-92,200,55),smallFont,Palette.Muted);platform.Anchor=AnchorStyles.Left|AnchorStyles.Bottom;
      status=AddLabel(footer,"◇  本地优先，无需账户",new Rectangle(28,30,370,30),smallFont,Palette.Muted);next=new SoftButton{Text="继续  →",Primary=true,Bounds=new Rectangle(848,20,98,46),Anchor=AnchorStyles.Right|AnchorStyles.Bottom};back=new SoftButton{Text="上一步",Bounds=new Rectangle(662,20,90,46),Anchor=AnchorStyles.Right|AnchorStyles.Bottom};cancel=new SoftButton{Text="取消",Bounds=new Rectangle(764,20,72,46),Anchor=AnchorStyles.Right|AnchorStyles.Bottom};footer.Controls.AddRange(new Control[]{next,back,cancel});AcceptButton=next;CancelButton=cancel;next.Click+=async(s,e)=>await Next();back.Click+=(s,e)=>{SavePage();ShowStep(Math.Max(0,step-1));};cancel.Click+=(s,e)=>Close();FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};Shown+=(s,e)=>ApplyCaption();ShowStep(0);
      using(var graphics=CreateGraphics())uiScale=graphics.DpiX/96f;
      if(uiScale!=1)Scale(new SizeF(uiScale,uiScale));
    }
    protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);ApplyCaption();}
    void ApplyCaption(){try{int dark=1;DwmSetWindowAttribute(Handle,20,ref dark,4);int chrome=0x272525;DwmSetWindowAttribute(Handle,35,ref chrome,4);}catch(DllNotFoundException){}catch(EntryPointNotFoundException){}}
    static Label AddLabel(Control parent,string text,Rectangle bounds,Font font,Color color){var label=new Label{Text=text,Bounds=bounds,Font=font,ForeColor=color,BackColor=Color.Transparent,AutoSize=false};parent.Controls.Add(label);return label;}
    Label Copy(string text,int y,int height){var label=AddLabel(content,text,new Rectangle(40,y,PageWidth-80,height),smallFont,Palette.Muted);label.Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right;return label;}
    void Heading(string title,string intro){var heading=AddLabel(content,title,new Rectangle(40,42,PageWidth-80,50),titleFont,Palette.Ink);heading.Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right;var summary=Copy(intro,106,60);summary.Font=bodyFont;}
    void ShowStep(int value){
      content.SuspendLayout();
      step=value;foreach(Control control in content.Controls.Cast<Control>().ToArray())control.Dispose();content.Controls.Clear();content.AutoScrollPosition=Point.Empty;back.Visible=step>0&&step<3;next.Text=step==2?"开始安装":step==3?"完成  →":"继续  →";cancel.Visible=step!=3;stepOne.Text=step==0?"❶   安装位置":"①   安装位置";stepTwo.Text=step==1?"❷   使用习惯":"②   使用习惯";stepThree.Text=step>=2?"❸   准备就绪":"③   准备就绪";stepOne.ForeColor=step==0?Palette.Ink:Palette.Muted;stepTwo.ForeColor=step==1?Palette.Ink:Palette.Muted;stepThree.ForeColor=step>=2?Palette.Ink:Palette.Muted;status.Text=String.IsNullOrEmpty(notice)?"◇  本地优先，无需账户":notice;
      if(step==0)LocationPage();else if(step==1)HabitsPage();else if(step==2)ReadyPage();else FinishPage();
      ScalePage();content.ResumeLayout(false);
    }
    void LocationPage(){
      Heading("为你的日常，留个位置。","ToZ 是一个离线待办工作台。\n选好安装位置，就可以开始了。");
      current=new ChoiceCard{Text="仅为当前用户安装",Note="推荐 · 不需要管理员权限",Bounds=new Rectangle(40,190,PageWidth-80,90),Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right};all=new ChoiceCard{Text="为这台电脑的所有用户安装",Note="需要 Windows 管理员授权",Bounds=new Rectangle(40,292,PageWidth-80,90),Anchor=current.Anchor};content.Controls.Add(current);content.Controls.Add(all);current.Checked=!allUsers;all.Checked=allUsers;current.CheckedChanged+=(s,e)=>{if(current.Checked)SwitchScope(false);};all.CheckedChanged+=(s,e)=>{if(all.Checked)SwitchScope(true);};
      var pathLabel=Copy("安装位置",404,24);pathLabel.ForeColor=Palette.Ink;var box=new SoftPanel{Bounds=new Rectangle(40,434,PageWidth-80,50),Anchor=current.Anchor};content.Controls.Add(box);pathInput=new TextBox{Text=directory,BorderStyle=BorderStyle.None,BackColor=Palette.Paper,ForeColor=Palette.Ink,Font=smallFont,Bounds=new Rectangle(14,16,box.Width-114,24),Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right,AccessibleName="安装位置",MaxLength=220};box.Controls.Add(pathInput);var browse=new SoftButton{Text="浏览…",Bounds=new Rectangle(box.Width-92,6,84,38),Anchor=AnchorStyles.Top|AnchorStyles.Right};browse.Click+=(s,e)=>{using(var picker=new FolderBrowserDialog{Description="选择 ToZ 程序安装目录",SelectedPath=pathInput.Text})if(picker.ShowDialog(this)==DialogResult.OK)pathInput.Text=picker.SelectedPath;};box.Controls.Add(browse);Copy("程序与任务分开保存。升级或更换安装位置，\n不会清空当前账户的任务。",510,64);
    }
    void SwitchScope(bool value){if(pathInput==null)return;if(allUsers)machinePath=pathInput.Text;else currentPath=pathInput.Text;allUsers=value;directory=allUsers?machinePath:currentPath;pathInput.Text=directory;}
    HabitCard Habit(string title,string note,int y,bool check){var card=new HabitCard{Text=title,Note=note,Checked=check,Bounds=new Rectangle(40,y,PageWidth-80,94),Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right};content.Controls.Add(card);return card;}
    void HabitsPage(){Heading("按你的习惯开始。","少几个打断，多一点顺手。\n选择快捷方式，以及登录后的启动方式。");desktopChoice=Habit("创建桌面快捷方式","从桌面，随时打开工作台。",190,desktop);menuChoice=Habit("添加到开始菜单","使用 Windows 搜索快速找到 ToZ。",296,startMenu);startupChoice=Habit("登录 Windows 后自动启动","默认关闭，仅为当前 Windows 账户设置。",402,autoStart);}
    void ReadyPage(){Heading("一切准备就绪。","确认下面的选择，然后开始安装。\n已有任务与历史会保留。");var card=new SoftPanel{Bounds=new Rectangle(40,190,PageWidth-80,290),Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right};content.Controls.Add(card);AddLabel(card,"安装范围",new Rectangle(18,18,550,24),smallFont,Palette.Muted);AddLabel(card,allUsers?"这台电脑的所有用户 · 需要管理员授权":"仅当前用户 · 无需管理员权限",new Rectangle(18,52,card.Width-36,32),bodyFont,Palette.Ink);AddLabel(card,"程序位置",new Rectangle(18,108,550,24),smallFont,Palette.Muted);AddLabel(card,directory,new Rectangle(18,142,card.Width-36,64),bodyFont,Palette.Ink);AddLabel(card,(desktop?"✓":"−")+" 桌面快捷方式    "+(startMenu?"✓":"−")+" 开始菜单    "+(autoStart?"✓":"−")+" 登录后启动",new Rectangle(18,230,card.Width-36,40),smallFont,Palette.Muted);Copy("任务保存在当前账户的独立数据目录。\n升级、更换程序目录或卸载，默认保留任务与备份。",510,66);}
    void FinishPage(){Heading("为今天，做好一件小事。","ToZ 已安装完成。\n你的任务、计划与每一次开始，都有了自己的位置。");launch=new CheckBox{Text="现在启动 ToZ",Checked=true,Bounds=new Rectangle(56,220,540,36),ForeColor=Palette.Ink,Font=bodyFont};content.Controls.Add(launch);Copy("无需登录，离线就能使用。\n从托盘或菜单可以随时唤回桌面浮窗。\n关闭主窗口默认收至托盘。",292,96);}
    void SavePage(){if(step==0){directory=InstallEngine.ValidatePath(pathInput.Text);allUsers=all.Checked;if(allUsers)machinePath=directory;else currentPath=directory;}if(step==1){desktop=desktopChoice.Checked;startMenu=menuChoice.Checked;autoStart=startupChoice.Checked;}}
    async Task Next(){try{if(step<2){SavePage();ShowStep(step+1);return;}if(step==3){if(complete&&launch.Checked){string app=Path.Combine(directory,"ToZ.exe");Process.Start(new ProcessStartInfo(app){UseShellExecute=true,WorkingDirectory=directory});}Close();return;}await Install();}catch(Exception error){MessageBox.Show(this,error.Message,"ToZ 安装",MessageBoxButtons.OK,MessageBoxIcon.Information);}}
    async Task Install(){
#if UI_PREVIEW
      await Task.Yield();throw new InvalidOperationException("界面验收程序不能执行安装。");
#else
      busy=true;next.Enabled=false;back.Enabled=false;cancel.Enabled=false;content.Controls.Clear();Heading("正在为你准备 ToZ。","正在复制程序并登记安装信息，请稍候。\n这不会清空你的任务。");var progress=new ProgressBar{Style=ProgressBarStyle.Marquee,MarqueeAnimationSpeed=28,Bounds=new Rectangle(40,218,PageWidth-80,8),Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right};content.Controls.Add(progress);Copy("安装进度由 Windows 和安装引擎处理。\n完成后会自动进入下一步。",252,70);ScalePage();status.Text="正在安装…";
      try{int code=await Task.Run(()=>InstallEngine.Run(allUsers,directory,desktop,startMenu));if(code!=0)throw new InvalidOperationException(code==1223?"已取消管理员授权，可重试或返回选择仅为当前用户安装。":"安装未完成（代码 "+code+"）。可返回检查安装目录后重试。");if(!File.Exists(Path.Combine(directory,"ToZ.exe")))throw new IOException("安装引擎未能写入 ToZ，请检查安装目录的访问权限。");complete=true;try{InstallEngine.SetStartup(autoStart,Path.Combine(directory,"ToZ.exe"));}catch(Exception error){notice="安装完成；启动项未保存："+error.Message;}ShowStep(3);}
      catch(Win32Exception error){ShowStep(2);if(error.NativeErrorCode!=1223)throw;status.Text="已取消管理员授权，可重试或返回选择当前用户安装。";}
      catch{ShowStep(2);throw;}
      finally{busy=false;next.Enabled=true;back.Enabled=true;cancel.Enabled=true;}
#endif
    }
#if UI_PREVIEW
    internal async void Review(string output){try{Directory.CreateDirectory(output);await Task.Delay(150);CheckSurfaces(this);SaveScreenshot(output,"01-location.png");pathInput.Text=@"C:\Apps\ToZ 界面验收";await Next();desktopChoice.Checked=false;await Next();if(directory!=@"C:\Apps\ToZ 界面验收"||desktop||!startMenu||autoStart)throw new Exception("导航没有保留目录与安装习惯");SaveScreenshot(output,"03-ready.png");ShowStep(1);if(desktopChoice.Checked)throw new Exception("返回后快捷方式选项丢失");CheckSurfaces(this);desktopChoice.Checked=true;menuChoice.Checked=false;startupChoice.Checked=true;CheckSurfaces(this);SaveScreenshot(output,"02-habits.png");desktopChoice.Checked=false;menuChoice.Checked=true;startupChoice.Checked=false;ShowStep(0);all.Checked=true;CheckSurfaces(this);if(!allUsers||pathInput.Text!=machinePath)throw new Exception("所有用户范围没有更新路径");current.Checked=true;if(pathInput.Text!=@"C:\Apps\ToZ 界面验收")throw new Exception("切换范围没有保留目录");ShowStep(3);SaveScreenshot(output,"04-finish.png");if(!InstallEngine.Arguments(true,@"C:\Apps\ToZ 空格",false,true).EndsWith(@"/D=C:\Apps\ToZ 空格"))throw new Exception("安装引擎参数错误");foreach(var invalid in new[]{@"C:\",@"relative\ToZ",@"\\server\ToZ","C:\\Apps\\\"bad"}){bool refused=false;try{InstallEngine.ValidatePath(invalid);}catch(ArgumentException){refused=true;}if(!refused)throw new Exception("未拒绝无效目录");}File.WriteAllText(Path.Combine(output,"result.txt"),"PASS: location/habits/ready/finish; navigation persistence; current/all-user paths; Unicode and spaces; backend flags; invalid paths; control background pixels in checked/unchecked and enabled/disabled states. No real installation, elevation or registry writes.");Close();}catch(Exception e){File.WriteAllText(Path.Combine(output,"result.txt"),"FAIL: "+e);Environment.Exit(1);}}
    void CheckSurfaces(Control parent){foreach(Control control in parent.Controls){
      if(control is SoftButton||control is ChoiceCard||control is HabitCard){
        bool enabled=control.Enabled;
        foreach(bool state in new[]{true,false}){control.Enabled=state;control.Refresh();using(var bitmap=new Bitmap(control.Width,control.Height)){
          control.DrawToBitmap(bitmap,control.ClientRectangle);
          foreach(var point in new[]{new Point(0,0),new Point(control.Width-1,0),new Point(0,control.Height-1),new Point(control.Width-1,control.Height-1)})if(bitmap.GetPixel(point.X,point.Y).ToArgb()!=control.Parent.BackColor.ToArgb())throw new Exception("控件圆角背景异常："+control.Text);
          Color expected=control is SoftButton?(((SoftButton)control).Primary?Color.FromArgb(229,229,234):Palette.Chrome):control is ChoiceCard&&((ChoiceCard)control).Checked?Color.FromArgb(51,51,54):Palette.Paper;
          if(bitmap.GetPixel(control.Width/2,control.Height-12).ToArgb()!=expected.ToArgb())throw new Exception("控件卡片底色异常："+control.Text);
        }}control.Enabled=enabled;
      }CheckSurfaces(control);
    }}
    void SaveScreenshot(string output,string name){using(var image=new Bitmap(Width,Height)){DrawToBitmap(image,new Rectangle(0,0,Width,Height));image.Save(Path.Combine(output,name),System.Drawing.Imaging.ImageFormat.Png);}}
#endif
  }
  static class Program {
    [STAThread]static int Main(string[] args){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
#if UI_PREVIEW
      if(args.Length!=1)throw new ArgumentException("界面检查必须指定隔离输出目录");var form=new InstallerForm();form.Shown+=(s,e)=>form.Review(args[0]);Application.Run(form);return 0;
#else
      if(args.Any(a=>a.Equals("/S",StringComparison.OrdinalIgnoreCase))){try{bool all=args.Any(a=>a.Equals("/allusers",StringComparison.OrdinalIgnoreCase));string raw=Environment.CommandLine;int index=raw.LastIndexOf(" /D=",StringComparison.OrdinalIgnoreCase);string directory=index>=0?raw.Substring(index+4).Trim('"'):InstallEngine.Existing(all)??Path.Combine(all?Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles):Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs"),"ToZ");bool desktop=!args.Any(a=>a.Equals("/DESKTOP=0",StringComparison.OrdinalIgnoreCase)),menu=!args.Any(a=>a.Equals("/STARTMENU=0",StringComparison.OrdinalIgnoreCase)),startup=args.Any(a=>a.Equals("/AUTOSTART=1",StringComparison.OrdinalIgnoreCase))||(!args.Any(a=>a.Equals("/AUTOSTART=0",StringComparison.OrdinalIgnoreCase))&&InstallEngine.Startup());int code=InstallEngine.Run(all,directory,desktop,menu);if(code==0)InstallEngine.SetStartup(startup,Path.Combine(directory,"ToZ.exe"));return code;}catch(Win32Exception error){return error.NativeErrorCode;}catch{return 2;}}
      Application.Run(new InstallerForm());return 0;
#endif
    }
  }
}
