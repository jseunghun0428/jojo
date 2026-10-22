
int __thiscall FUN_0041fa91(void *this,int param_1)

{
  uint uVar1;
  int local_8;
  
  local_8 = 0;
  do {
    if (param_1 == 0) {
      return local_8;
    }
    if (DAT_00497ae8 == '\0') {
      uVar1 = FUN_0041faf2(this);
      if (uVar1 == 0xffffffff) {
        return -1;
      }
      DAT_00497ae4 = (byte)uVar1;
      DAT_00497ae8 = '\b';
    }
    DAT_00497ae8 = DAT_00497ae8 + -1;
    local_8 = (uint)((DAT_00497ae4 & 0x80) != 0) + local_8 * 2;
    DAT_00497ae4 = DAT_00497ae4 << 1;
    param_1 = param_1 + -1;
  } while( true );
}

