
uint __thiscall FUN_004070e1(void *this,undefined1 param_1,int param_2)

{
  uint local_8;
  
  local_8 = 0;
  switch(param_1) {
  case 0:
    local_8 = (uint)*(byte *)((int)this + 0x21);
    break;
  case 1:
    local_8 = (uint)*(byte *)((int)this + 0x22);
    break;
  case 2:
    local_8 = (uint)*(byte *)((int)this + 0x23);
    break;
  case 3:
    local_8 = (uint)*(byte *)((int)this + 0x24);
    break;
  case 4:
    local_8 = (uint)*(byte *)((int)this + 0x25);
  }
  if (param_2 != 0) {
    local_8 = local_8 << 1;
  }
  return local_8;
}

