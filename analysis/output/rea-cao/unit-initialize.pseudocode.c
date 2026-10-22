
undefined1 * __thiscall FUN_00408c0c(void *this,uint param_1,undefined1 *param_2,int param_3)

{
  byte bVar1;
  ushort uVar2;
  undefined4 uVar3;
  uint local_14;
  undefined1 *local_c;
  undefined1 *local_8;
  
  local_8 = param_2;
  local_c = (undefined1 *)((int)this + 8);
  local_14._0_1_ = 0;
  _memset(this,0,0x48);
  *(uint *)this = param_1 | 0x1000;
  for (; (byte)local_14 < 0xc; local_14._0_1_ = (byte)local_14 + 1) {
    *local_c = *local_8;
    local_c = local_c + 1;
    local_8 = local_8 + 1;
  }
  FUN_0040a72c((int)this);
  uVar2 = *(ushort *)(param_2 + 0xd);
  *(uint *)((int)this + 4) = (uint)uVar2;
  FUN_00423e30((int)this,param_3,uVar2);
  uVar3 = *(undefined4 *)(param_2 + 0x10);
  *(char *)((int)this + 0x26) = (char)uVar3;
  *(char *)((int)this + 0x2a) = (char)((uint)uVar3 >> 8);
  for (local_14 = 0; (byte)local_14 < 5; local_14 = (uint)(byte)((byte)local_14 + 1)) {
    bVar1 = param_2[local_14 + 0x12];
    *(ushort *)((int)this + local_14 * 2 + 0x11) = (ushort)bVar1;
    *(byte *)(local_14 + 0x21 + (int)this) = bVar1;
  }
  *(uint *)((int)this + 0x1b) = (uint)*(ushort *)(param_2 + 0x17);
  *(undefined1 *)((int)this + 0x1f) = param_2[0x19];
  *(undefined4 *)((int)this + 0x2b) = *(undefined4 *)(param_2 + 0x1a);
  uVar3 = *(undefined4 *)(param_2 + 0x1e);
  *(char *)((int)this + 0x31) = (char)uVar3;
  *(char *)((int)this + 0x34) = (char)((uint)uVar3 >> 8);
  if (500 < *(ushort *)((int)this + 0x1b)) {
    *(undefined2 *)((int)this + 0x1b) = 500;
  }
  if (0xfa < *(byte *)((int)this + 0x1f)) {
    *(undefined1 *)((int)this + 0x1f) = 0xfa;
  }
  if (*(char *)((int)this + 0x2c) == '\0') {
    *(char *)((int)this + 0x2c) = *(char *)((int)this + 0x2c) + '\x01';
  }
  return param_2 + 0x20;
}

